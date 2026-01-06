import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { minify } from 'uglify-js'
import offlineTemplate from './offline'

type args = {
    root?: string
    type?: 'static' | 'runtime'
    uncompressed?: boolean
    debug?: boolean
    cli?: boolean
}

export default ({ root = 'build', type = 'runtime', uncompressed = false, debug = false, cli = false }: args) => {
    // Validate type
    if (type && type !== 'static' && type !== 'runtime') {
        throw new Error(`Invalid type: "${type}". Must be "static" or "runtime"`)
    }

    root = path.resolve(root)

    if (cli) {
        console.log('ROOT: ' + root)
        console.log('TYPE: ' + type)

        if (uncompressed) console.log('UNCOMPRESSED: True')
        if (debug) console.log('DEBUG: True')
    }

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        throw new Error(`Directory not found: "${root}"`)
    }

    const paths = {
        src: {
            sw: path.resolve(__dirname, '../scripts/service-worker.js'),
            swHandler: path.resolve(__dirname, '../scripts/service-worker-handler.js')
        },
        dest: {
            apphash: path.resolve(root, 'apphash.json'),
            sw: path.resolve(root, 'service-worker.js'),
            swHandler: path.resolve(root, 'service-worker-handler.js'),
            swAppend: path.resolve(root, 'service-worker-append.js')
        }
    }

    // Create offline.html if it doesn't exist for runtime mode
    if (type === 'runtime') {
        const offlinePath = path.resolve(root, 'offline.html')
        if (!fs.existsSync(offlinePath) || !fs.statSync(offlinePath).isFile()) {
            try {
                fs.writeFileSync(offlinePath, offlineTemplate)
                if (cli) console.log('Created offline.html at: ' + offlinePath)
            } catch (error) {
                throw new Error(
                    `Failed to create offline.html: ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }

    // Remove existing files
    try {
        removeFileIfExists(paths.dest.apphash)
        removeFileIfExists(paths.dest.sw)
        removeFileIfExists(paths.dest.swHandler)
    } catch (error) {
        throw new Error(`Failed to remove existing files: ${error instanceof Error ? error.message : String(error)}`)
    }

    let swContent: string
    try {
        swContent = fs.readFileSync(paths.src.sw).toString()
    } catch (error) {
        throw new Error(
            `Failed to read service worker template: ${error instanceof Error ? error.message : String(error)}`
        )
    }

    // If static
    if (type === 'static') swContent = swContent.replace('const isStatic = false', 'const isStatic = true')
    // If debug
    if (debug) swContent = swContent.replace('const debug = false', 'const debug = true')

    try {
        fs.writeFileSync(paths.dest.sw, swContent)
    } catch (error) {
        throw new Error(`Failed to write service worker: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Service worker handle setup
    try {
        fs.copyFileSync(paths.src.swHandler, paths.dest.swHandler)
    } catch (error) {
        throw new Error(
            `Failed to copy service worker handler: ${error instanceof Error ? error.message : String(error)}`
        )
    }

    // Service worker append file setup
    if (fs.existsSync(paths.dest.swAppend) && fs.statSync(paths.dest.swAppend).isFile()) {
        try {
            const swAppendContent = '\n' + fs.readFileSync(paths.dest.swAppend).toString()
            fs.appendFileSync(paths.dest.sw, swAppendContent)
            if (cli) console.log('APPEND: ' + paths.dest.swAppend)
        } catch (error) {
            throw new Error(
                `Failed to append custom service worker code: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    if (!uncompressed) {
        for (const filePath of [paths.dest.sw, paths.dest.swHandler]) {
            try {
                const fileContent = fs.readFileSync(filePath).toString()
                const minifiedContent = minify(fileContent)
                if (minifiedContent.error) {
                    throw new Error(`Minification failed for ${filePath}: ${minifiedContent.error.message}`)
                }
                if (!minifiedContent.code) {
                    throw new Error(`Minification returned empty code for ${filePath}`)
                }
                fs.writeFileSync(filePath, minifiedContent.code)
            } catch (error) {
                throw new Error(
                    `Failed to minify ${filePath}: ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }

    // App hash setup
    let hash: string, files: string[], size: number
    try {
        const dirInfo = dirinfo(root)
        hash = dirInfo.hash
        files = dirInfo.files
        size = dirInfo.size
    } catch (error) {
        throw new Error(`Failed to generate directory info: ${error instanceof Error ? error.message : String(error)}`)
    }

    let apphashContent = ''
    if (type === 'static') {
        apphashContent = JSON.stringify({ hash, files, size })
    } else {
        apphashContent = JSON.stringify({ hash })
    }

    try {
        fs.writeFileSync(paths.dest.apphash, apphashContent)
    } catch (error) {
        throw new Error(`Failed to write apphash.json: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (cli) console.log('\n✅ Application service worker generated!')
}

const removeFileIfExists = (filePath: string) => {
    if (!filePath) return
    if (!fs.existsSync(filePath)) return
    // Only delete files, not directories
    const stats = fs.statSync(filePath)
    if (stats.isFile()) {
        fs.rmSync(filePath)
    }
}

const dirinfo = (dirPath: string) => {
    var size = 0
    var hash = ''
    var files: string[] = []

    if (!dirPath) throw new Error('Directory path required!')

    dirPath = path.resolve(dirPath)

    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        throw new Error(`Directory path not found: "${dirPath}"`)
    }

    const walk = (dirPath: string, visitedPaths = new Set<string>()) => {
        // Prevent infinite loops from symlinks
        const resolvedPath = path.resolve(dirPath)
        if (visitedPaths.has(resolvedPath)) {
            return
        }
        visitedPaths.add(resolvedPath)

        const dirFiles = fs.readdirSync(dirPath)
        // Sort files for deterministic hash generation
        const sortedFiles = dirFiles.sort()

        sortedFiles.forEach((file: string) => {
            const filePath = path.join(dirPath, file)
            let stats: fs.Stats
            try {
                stats = fs.statSync(filePath)
            } catch (error) {
                // Skip files that can't be accessed (permissions, broken symlinks, etc.)
                return
            }

            if (stats.isDirectory()) {
                walk(filePath, visitedPaths)
            } else if (stats.isFile()) {
                files.push(filePath)

                size += stats.size

                try {
                    const fileContent = fs.readFileSync(filePath, 'base64')
                    hash = crypto
                        .createHash('md5')
                        .update(hash + file + fileContent)
                        .digest('hex')
                } catch (error) {
                    throw new Error(
                        `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }
            // Skip other file types (sockets, FIFOs, etc.)
        })

        return files
    }

    walk(dirPath)

    // Sort files and normalize paths
    // Ensure paths start with '/' for proper URL resolution
    // Normalize Windows backslashes to forward slashes for web URLs
    files = files
        .map(file => {
            let relativePath = file.slice(dirPath.length)
            // Normalize Windows path separators to forward slashes
            relativePath = relativePath.replace(/\\/g, '/')
            // Ensure path starts with '/'
            return relativePath.startsWith('/') ? relativePath : '/' + relativePath
        })
        .sort()

    return { files, size, hash, root: dirPath }
}
