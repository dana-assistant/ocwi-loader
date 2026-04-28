import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(root, 'package.json')
const srcPath = path.join(root, 'src', 'loader.js')
const distDir = path.join(root, 'dist')
const distPath = path.join(distDir, 'loader.js')

const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
const config = pkg.ocwiLoader ?? {}

const replacements = {
  __OCWI_LOADER_VERSION__: JSON.stringify(pkg.version),
  __OCWI_CORE_PACKAGE__: JSON.stringify(process.env.OCWI_CORE_PACKAGE || config.corePackage),
  __OCWI_CORE_VERSION__: JSON.stringify(process.env.OCWI_CORE_VERSION || config.coreVersion),
  __OCWI_CORE_FILE__: JSON.stringify(process.env.OCWI_CORE_FILE || config.coreFile),
  __OCWI_CDN_BASE__: JSON.stringify(process.env.OCWI_CDN_BASE || config.cdnBase),
}

let source = await readFile(srcPath, 'utf8')
for (const [token, value] of Object.entries(replacements)) {
  source = source.split(token).join(value)
}

const banner = [
  `/*! ${pkg.name} v${pkg.version}`,
  ` * core: ${replacements.__OCWI_CORE_PACKAGE__.slice(1, -1)}@${replacements.__OCWI_CORE_VERSION__.slice(1, -1)}`,
  ' * This file is generated from src/loader.js.',
  ' */',
  '',
].join('\n')

await mkdir(distDir, { recursive: true })
await writeFile(distPath, banner + source, 'utf8')

console.log(`Built ${path.relative(root, distPath)}`)
