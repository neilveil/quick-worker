#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("yargs/helpers");
const yargs_1 = __importDefault(require("yargs/yargs"));
const index_1 = __importDefault(require("./index"));
const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .option('root', {
    type: 'string',
    description: 'Build directory path',
    default: 'build'
})
    .option('type', {
    type: 'string',
    choices: ['static', 'runtime'],
    description: 'Cache type: static or runtime',
    default: 'runtime'
})
    .option('debug', {
    type: 'boolean',
    description: 'Add debugging logs in output scripts',
    default: false
})
    .option('uncompressed', {
    type: 'boolean',
    description: 'Output uncompressed scripts',
    default: false
})
    .parseSync();
(0, index_1.default)({
    root: argv.root,
    type: argv.type,
    debug: argv.debug || false,
    uncompressed: argv.uncompressed || false,
    cli: true
});
