#!/usr/bin/env node

import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import main from './index'

interface Argv {
    root?: string
    type?: 'static' | 'runtime'
    debug?: boolean
    uncompressed?: boolean
}

const argv = yargs(hideBin(process.argv))
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
    .parseSync() as Argv

main({
    root: argv.root,
    type: argv.type as 'static' | 'runtime',
    debug: argv.debug || false,
    uncompressed: argv.uncompressed || false,
    cli: true
})
