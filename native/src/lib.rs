use std::ops::Deref;
use std::sync::{atomic::AtomicBool, Mutex};

use bun_native_plugin::{anyhow, bun, define_bun_plugin, Error, Result};
use fxhash::{FxHashMap, FxHashSet};
use napi::bindgen_prelude::{Array, External, ExternalRef, Object};
use napi::{Env, Result as NapiResult};
use utf16::IndexConverter;

#[macro_use]
extern crate napi_derive;

mod utf16;

#[derive(Debug, Clone)]
#[napi(object)]
pub struct ChangedContent {
    pub file: Option<String>,
    pub content: Option<String>,
    pub extension: String,
}

#[derive(Debug, Clone)]
#[napi(object)]
pub struct GlobEntry {
    pub base: String,
    pub pattern: String,
}

#[derive(Debug, Clone)]
#[napi(object)]
pub struct SourceEntry {
    pub base: String,
    pub pattern: String,
    pub negated: bool,
}

impl From<ChangedContent> for tailwindcss_oxide::ChangedContent {
    fn from(changed_content: ChangedContent) -> Self {
        if let Some(file) = changed_content.file {
            return tailwindcss_oxide::ChangedContent::File(file.into(), changed_content.extension);
        }

        if let Some(contents) = changed_content.content {
            return tailwindcss_oxide::ChangedContent::Content(contents, changed_content.extension);
        }

        unreachable!()
    }
}

impl From<GlobEntry> for tailwindcss_oxide::GlobEntry {
    fn from(glob: GlobEntry) -> Self {
        Self {
            base: glob.base,
            pattern: glob.pattern,
        }
    }
}

impl From<tailwindcss_oxide::GlobEntry> for GlobEntry {
    fn from(glob: tailwindcss_oxide::GlobEntry) -> Self {
        Self {
            base: glob.base,
            pattern: glob.pattern,
        }
    }
}

impl From<SourceEntry> for tailwindcss_oxide::PublicSourceEntry {
    fn from(source: SourceEntry) -> Self {
        Self {
            base: source.base,
            pattern: source.pattern,
            negated: source.negated,
        }
    }
}

#[derive(Debug, Clone)]
#[napi(object)]
pub struct ScannerOptions {
    pub sources: Option<Vec<SourceEntry>>,
}

#[derive(Debug, Clone)]
#[napi]
pub struct Scanner {
    scanner: tailwindcss_oxide::Scanner,
}

#[derive(Debug, Clone)]
#[napi(object)]
pub struct CandidateWithPosition {
    pub candidate: String,
    pub position: i64,
}

#[napi]
impl Scanner {
    #[napi(constructor)]
    pub fn new(opts: ScannerOptions) -> Self {
        Self {
            scanner: tailwindcss_oxide::Scanner::new(match opts.sources {
                Some(sources) => sources.into_iter().map(Into::into).collect(),
                None => vec![],
            }),
        }
    }

    #[napi]
    pub fn scan(&mut self) -> Vec<String> {
        self.scanner.scan()
    }

    #[napi]
    pub fn scan_files(&mut self, input: Vec<ChangedContent>) -> Vec<String> {
        self.scanner
            .scan_content(input.into_iter().map(Into::into).collect())
    }

    #[napi]
    pub fn get_candidates_with_positions(
        &mut self,
        input: ChangedContent,
    ) -> Vec<CandidateWithPosition> {
        let content = input.content.unwrap_or_else(|| {
            std::fs::read_to_string(input.file.unwrap()).expect("Failed to read file")
        });

        let input = ChangedContent {
            file: None,
            content: Some(content.clone()),
            extension: input.extension,
        };

        let mut utf16_idx = IndexConverter::new(&content[..]);

        self.scanner
            .get_candidates_with_positions(input.into())
            .into_iter()
            .map(|(candidate, position)| CandidateWithPosition {
                candidate,
                position: utf16_idx.get(position),
            })
            .collect()
    }

    #[napi(getter)]
    pub fn files(&mut self) -> Vec<String> {
        self.scanner.get_files()
    }

    #[napi(getter)]
    pub fn globs(&mut self) -> Vec<GlobEntry> {
        self.scanner
            .get_globs()
            .into_iter()
            .map(Into::into)
            .collect()
    }

    #[napi(getter)]
    pub fn normalized_sources(&mut self) -> Vec<GlobEntry> {
        self.scanner
            .get_normalized_sources()
            .into_iter()
            .map(Into::into)
            .collect()
    }
}

#[derive(Default)]
pub struct TailwindContextExternal {
    module_graph_candidates: Mutex<FxHashMap<String, FxHashSet<String>>>,
    dirty: AtomicBool,
}

#[napi(object)]
pub struct CandidatesEntry {
    pub id: String,
    pub candidates: Vec<String>,
}

define_bun_plugin!("tailwindcss");

#[no_mangle]
#[napi]
pub fn twctx_create(env: &Env) -> NapiResult<ExternalRef<TailwindContextExternal>> {
    let external = ExternalRef::new(
        env,
        TailwindContextExternal {
            module_graph_candidates: Default::default(),
            dirty: AtomicBool::new(false),
        },
    )?;

    Ok(external)
}

#[no_mangle]
#[napi]
pub fn twctx_to_js(env: &Env, ctx: ExternalRef<TailwindContextExternal>) -> NapiResult<Array<'_>> {
    let candidates = ctx.module_graph_candidates.lock().map_err(|_| {
        napi::Error::new(
            napi::Status::WouldDeadlock,
            "Failed to acquire lock on candidates: another thread panicked while holding the lock.",
        )
    })?;

    let len: u32 = candidates.len().try_into().map_err(|_| {
        napi::Error::new(
            napi::Status::InvalidArg,
            format!("Too many candidates: {}", candidates.len()),
        )
    })?;

    let mut arr = env.create_array(len)?;

    for (i, (id, candidates)) in candidates.iter().enumerate() {
        let mut obj = Object::new(env)?;
        obj.set("id", id)?;
        obj.set("candidates", candidates.iter().collect::<Vec<_>>())?;
        arr.set(i as u32, obj)?;
    }

    Ok(arr)
}

#[no_mangle]
#[napi]
pub fn twctx_is_dirty(_env: Env, ctx: ExternalRef<TailwindContextExternal>) -> NapiResult<bool> {
    Ok(ctx.dirty.load(std::sync::atomic::Ordering::Acquire))
}

#[bun]
pub fn tw_on_before_parse(handle: &mut OnBeforeParse) -> Result<()> {
    let source_code = handle.input_source_code()?;

    let mut scanner = tailwindcss_oxide::Scanner::new(vec![]);
    let candidates = scanner.scan_content(vec![tailwindcss_oxide::ChangedContent::Content(
        source_code.to_string(),
        String::new(),
    )]);

    if !candidates.is_empty() {
        let tw_ctx: &TailwindContextExternal = unsafe {
            handle
                .external(External::inner_from_raw)
                .and_then(|external| external.ok_or(Error::Unknown))?
        };

        let mut graph_candidates = tw_ctx.module_graph_candidates.lock().map_err(|_| {
            anyhow::Error::msg(
        "Failed to acquire lock on candidates: another thread panicked while holding the lock",
      )
        })?;

        tw_ctx
            .dirty
            .store(true, std::sync::atomic::Ordering::Release);

        let path = handle.path()?;

        if let Some(existing) = graph_candidates.get_mut(path.deref()) {
            existing.extend(candidates);
        } else {
            graph_candidates.insert(path.to_string(), candidates.into_iter().collect());
        }
    }

    handle.set_output_loader(handle.output_loader());

    Ok(())
}
