"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uglify_js_1 = require("uglify-js");
const offline_1 = __importDefault(require("./offline"));
exports.default = ({ root = 'build', type = 'runtime', uncompressed = false, debug = false, cli = false }) => {
    if (type && type !== 'static' && type !== 'runtime') {
        throw new Error(`Invalid type: "${type}". Must be "static" or "runtime"`);
    }
    root = path_1.default.resolve(root);
    if (cli) {
        console.log('ROOT: ' + root);
        console.log('TYPE: ' + type);
        if (uncompressed)
            console.log('UNCOMPRESSED: True');
        if (debug)
            console.log('DEBUG: True');
    }
    if (!fs_1.default.existsSync(root) || !fs_1.default.statSync(root).isDirectory()) {
        throw new Error(`Directory not found: "${root}"`);
    }
    const paths = {
        src: {
            sw: path_1.default.resolve(__dirname, '../scripts/service-worker.js'),
            swHandler: path_1.default.resolve(__dirname, '../scripts/service-worker-handler.js')
        },
        dest: {
            apphash: path_1.default.resolve(root, 'apphash.json'),
            sw: path_1.default.resolve(root, 'service-worker.js'),
            swHandler: path_1.default.resolve(root, 'service-worker-handler.js'),
            swAppend: path_1.default.resolve(root, 'service-worker-append.js')
        }
    };
    if (type === 'runtime') {
        const offlinePath = path_1.default.resolve(root, 'offline.html');
        if (!fs_1.default.existsSync(offlinePath) || !fs_1.default.statSync(offlinePath).isFile()) {
            try {
                fs_1.default.writeFileSync(offlinePath, offline_1.default);
                if (cli)
                    console.log('Created offline.html at: ' + offlinePath);
            }
            catch (error) {
                throw new Error(`Failed to create offline.html: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    try {
        removeFileIfExists(paths.dest.apphash);
        removeFileIfExists(paths.dest.sw);
        removeFileIfExists(paths.dest.swHandler);
    }
    catch (error) {
        throw new Error(`Failed to remove existing files: ${error instanceof Error ? error.message : String(error)}`);
    }
    let swContent;
    try {
        swContent = fs_1.default.readFileSync(paths.src.sw).toString();
    }
    catch (error) {
        throw new Error(`Failed to read service worker template: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (type === 'static')
        swContent = swContent.replace('const isStatic = false', 'const isStatic = true');
    if (debug)
        swContent = swContent.replace('const debug = false', 'const debug = true');
    try {
        fs_1.default.writeFileSync(paths.dest.sw, swContent);
    }
    catch (error) {
        throw new Error(`Failed to write service worker: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        fs_1.default.copyFileSync(paths.src.swHandler, paths.dest.swHandler);
    }
    catch (error) {
        throw new Error(`Failed to copy service worker handler: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (fs_1.default.existsSync(paths.dest.swAppend) && fs_1.default.statSync(paths.dest.swAppend).isFile()) {
        try {
            const swAppendContent = '\n' + fs_1.default.readFileSync(paths.dest.swAppend).toString();
            fs_1.default.appendFileSync(paths.dest.sw, swAppendContent);
            if (cli)
                console.log('APPEND: ' + paths.dest.swAppend);
        }
        catch (error) {
            throw new Error(`Failed to append custom service worker code: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (!uncompressed) {
        for (const filePath of [paths.dest.sw, paths.dest.swHandler]) {
            try {
                const fileContent = fs_1.default.readFileSync(filePath).toString();
                const minifiedContent = (0, uglify_js_1.minify)(fileContent);
                if (minifiedContent.error) {
                    throw new Error(`Minification failed for ${filePath}: ${minifiedContent.error.message}`);
                }
                if (!minifiedContent.code) {
                    throw new Error(`Minification returned empty code for ${filePath}`);
                }
                fs_1.default.writeFileSync(filePath, minifiedContent.code);
            }
            catch (error) {
                throw new Error(`Failed to minify ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    let hash, files, size;
    try {
        const dirInfo = dirinfo(root);
        hash = dirInfo.hash;
        files = dirInfo.files;
        size = dirInfo.size;
    }
    catch (error) {
        throw new Error(`Failed to generate directory info: ${error instanceof Error ? error.message : String(error)}`);
    }
    let apphashContent = '';
    if (type === 'static') {
        apphashContent = JSON.stringify({ hash, files, size });
    }
    else {
        apphashContent = JSON.stringify({ hash });
    }
    try {
        fs_1.default.writeFileSync(paths.dest.apphash, apphashContent);
    }
    catch (error) {
        throw new Error(`Failed to write apphash.json: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (cli)
        console.log('\n✅ Application service worker generated!');
};
const removeFileIfExists = (filePath) => {
    if (!filePath)
        return;
    if (!fs_1.default.existsSync(filePath))
        return;
    const stats = fs_1.default.statSync(filePath);
    if (stats.isFile()) {
        fs_1.default.rmSync(filePath);
    }
};
const dirinfo = (dirPath) => {
    var size = 0;
    var hash = '';
    var files = [];
    if (!dirPath)
        throw new Error('Directory path required!');
    dirPath = path_1.default.resolve(dirPath);
    if (!fs_1.default.existsSync(dirPath) || !fs_1.default.statSync(dirPath).isDirectory()) {
        throw new Error(`Directory path not found: "${dirPath}"`);
    }
    const walk = (dirPath, visitedPaths = new Set()) => {
        const resolvedPath = path_1.default.resolve(dirPath);
        if (visitedPaths.has(resolvedPath)) {
            return;
        }
        visitedPaths.add(resolvedPath);
        const dirFiles = fs_1.default.readdirSync(dirPath);
        const sortedFiles = dirFiles.sort();
        sortedFiles.forEach((file) => {
            const filePath = path_1.default.join(dirPath, file);
            let stats;
            try {
                stats = fs_1.default.statSync(filePath);
            }
            catch (error) {
                return;
            }
            if (stats.isDirectory()) {
                walk(filePath, visitedPaths);
            }
            else if (stats.isFile()) {
                files.push(filePath);
                size += stats.size;
                try {
                    const fileContent = fs_1.default.readFileSync(filePath, 'base64');
                    hash = crypto_1.default
                        .createHash('md5')
                        .update(hash + file + fileContent)
                        .digest('hex');
                }
                catch (error) {
                    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });
        return files;
    };
    walk(dirPath);
    files = files
        .map(file => {
        let relativePath = file.slice(dirPath.length);
        relativePath = relativePath.replace(/\\/g, '/');
        return relativePath.startsWith('/') ? relativePath : '/' + relativePath;
    })
        .sort();
    return { files, size, hash, root: dirPath };
};
