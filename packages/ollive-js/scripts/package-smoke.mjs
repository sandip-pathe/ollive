import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "ollive-package-smoke-"));
let tarballPath;

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }
  return result.stdout || "";
}

function npm(args, cwd) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args], cwd);
  }
  return run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd);
}

try {
  const packOutput = npm(["pack", "--json"], packageRoot);
  const jsonMatch = packOutput.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);
  if (!jsonMatch) {
    throw new Error(`npm pack did not return JSON metadata\n${packOutput}`);
  }

  const [packed] = JSON.parse(jsonMatch[1]);
  if (!packed?.filename || !Array.isArray(packed.files)) {
    throw new Error("npm pack metadata was incomplete");
  }
  tarballPath = join(packageRoot, packed.filename);

  const packedFiles = new Set(packed.files.map((entry) => entry.path));
  for (const required of ["LICENSE", "README.md", "package.json", "dist/index.js", "dist/index.d.ts"]) {
    if (!packedFiles.has(required)) {
      throw new Error(`Packed SDK is missing ${required}`);
    }
  }

  writeFileSync(
    join(temporaryRoot, "package.json"),
    JSON.stringify({ name: "ollive-package-consumer", private: true, type: "module" }, null, 2),
  );
  writeFileSync(
    join(temporaryRoot, "index.mjs"),
    `import { createOlliveClient } from "@ollive/risk-layer";\n` +
      `const client = createOlliveClient({ endpoint: "http://localhost:8001", fetch: async () => new Response("{}", { status: 200 }) });\n` +
      `if (!client || typeof client.startRun !== "function") throw new Error("SDK runtime export is invalid");\n`,
  );
  writeFileSync(
    join(temporaryRoot, "index.ts"),
    `import { createOlliveClient, type OlliveClient } from "@ollive/risk-layer";\n` +
      `const client: OlliveClient = createOlliveClient({ endpoint: "http://localhost:8001" });\n` +
      `void client;\n`,
  );
  writeFileSync(
    join(temporaryRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["index.ts"],
      },
      null,
      2,
    ),
  );

  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], temporaryRoot);
  run(process.execPath, [join(temporaryRoot, "index.mjs")], temporaryRoot);

  const tscPath = join(packageRoot, "node_modules", "typescript", "bin", "tsc");
  readFileSync(tscPath);
  run(process.execPath, [tscPath, "-p", join(temporaryRoot, "tsconfig.json")], temporaryRoot);

  process.stdout.write(`Packed and consumed ${packed.filename} on Node ${process.version}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
  if (tarballPath) rmSync(tarballPath, { force: true });
}
