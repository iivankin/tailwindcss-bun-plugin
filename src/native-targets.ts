export type NativeLibc = "glibc" | "musl";

export interface NativeTarget {
  cpu: string[];
  filename: string;
  id: string;
  libc?: NativeLibc[];
  os: string[];
  packageName: string;
  target: string;
}

export const NATIVE_TARGETS: NativeTarget[] = [
  {
    id: "android-arm64",
    target: "aarch64-linux-android",
    filename: "tailwindcss-oxide.android-arm64.node",
    packageName: "tailwindcss-bun-plugin-android-arm64",
    os: ["android"],
    cpu: ["arm64"],
  },
  {
    id: "darwin-arm64",
    target: "aarch64-apple-darwin",
    filename: "tailwindcss-oxide.darwin-arm64.node",
    packageName: "tailwindcss-bun-plugin-darwin-arm64",
    os: ["darwin"],
    cpu: ["arm64"],
  },
  {
    id: "darwin-x64",
    target: "x86_64-apple-darwin",
    filename: "tailwindcss-oxide.darwin-x64.node",
    packageName: "tailwindcss-bun-plugin-darwin-x64",
    os: ["darwin"],
    cpu: ["x64"],
  },
  {
    id: "linux-arm64-gnu",
    target: "aarch64-unknown-linux-gnu",
    filename: "tailwindcss-oxide.linux-arm64-gnu.node",
    packageName: "tailwindcss-bun-plugin-linux-arm64-gnu",
    os: ["linux"],
    cpu: ["arm64"],
    libc: ["glibc"],
  },
  {
    id: "linux-arm64-musl",
    target: "aarch64-unknown-linux-musl",
    filename: "tailwindcss-oxide.linux-arm64-musl.node",
    packageName: "tailwindcss-bun-plugin-linux-arm64-musl",
    os: ["linux"],
    cpu: ["arm64"],
    libc: ["musl"],
  },
  {
    id: "linux-x64-gnu",
    target: "x86_64-unknown-linux-gnu",
    filename: "tailwindcss-oxide.linux-x64-gnu.node",
    packageName: "tailwindcss-bun-plugin-linux-x64-gnu",
    os: ["linux"],
    cpu: ["x64"],
    libc: ["glibc"],
  },
  {
    id: "linux-x64-musl",
    target: "x86_64-unknown-linux-musl",
    filename: "tailwindcss-oxide.linux-x64-musl.node",
    packageName: "tailwindcss-bun-plugin-linux-x64-musl",
    os: ["linux"],
    cpu: ["x64"],
    libc: ["musl"],
  },
  {
    id: "win32-arm64-msvc",
    target: "aarch64-pc-windows-msvc",
    filename: "tailwindcss-oxide.win32-arm64-msvc.node",
    packageName: "tailwindcss-bun-plugin-win32-arm64-msvc",
    os: ["win32"],
    cpu: ["arm64"],
  },
  {
    id: "win32-x64-msvc",
    target: "x86_64-pc-windows-msvc",
    filename: "tailwindcss-oxide.win32-x64-msvc.node",
    packageName: "tailwindcss-bun-plugin-win32-x64-msvc",
    os: ["win32"],
    cpu: ["x64"],
  },
];

export function getNativeTargetByTriple(target: string) {
  return NATIVE_TARGETS.find((entry) => entry.target === target);
}

export function getNativeTargetForRuntime(
  platform: string,
  arch: string,
  libc?: NativeLibc
) {
  return NATIVE_TARGETS.find((entry) => {
    if (!entry.os.includes(platform)) return false;
    if (!entry.cpu.includes(arch)) return false;
    if (!entry.libc) return true;
    return libc ? entry.libc.includes(libc) : false;
  });
}
