# tailwindcss-bun-plugin

Tailwind CSS v4 plugin for `Bun.build`.

## Why This Exists

The original `bun-plugin-tailwind` is not in good shape for real use:

- its GitHub source is not properly published
- it does not appear to be maintained
- it is stuck on Tailwind CSS `4.1.14`
- its packaging strategy pulls more native binaries than necessary

This package exists to provide a maintained Tailwind CSS plugin for Bun that tracks Tailwind CSS `4.2.x`, works with Bun `1.3.10+`, and ships platform-specific native bindings through optional dependencies instead of downloading every binary for every install.

## Install

```bash
bun add tailwindcss-bun-plugin tailwindcss -E
```

## Usage

```ts
import tailwindcss from "tailwindcss-bun-plugin";

await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  plugins: [tailwindcss],
});
```

Create a CSS entry that imports Tailwind:

```css
@import "tailwindcss";
```

Then import that CSS from your Bun entrypoint:

```ts
import "./app.css";
```

If you use Bun's HTML/static dev server or `Bun.serve()` static routes, also add the plugin to your `bunfig.toml`:

```toml
[serve.static]
plugins = ["tailwindcss-bun-plugin"]
```
