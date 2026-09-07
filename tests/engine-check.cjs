'use strict';
const {mkdtempSync,writeFileSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const {convert} = require('../converter.js');
const {engineCases} = require('./fixtures.cjs');
const binaries = process.argv.slice(2);
if (!binaries.length) throw new Error('Usage: node tests/engine-check.cjs /path/to/sing-box [/path/to/other-version]');
const temp=mkdtempSync(join(tmpdir(),'xhttp-check-'));
let checks=0;
try {
    for (const bin of binaries) {
        const version=spawnSync(bin,['version'],{encoding:'utf8',timeout:10000});
        if (version.status!==0) throw new Error(version.stderr || String(version.error));
        console.log(version.stdout.split('\n')[0]);
        for (const item of engineCases) {
            const outbound=convert(item.url,{profile:item.profile}).config;
            const path=join(temp,item.name+'.json');
            writeFileSync(path,JSON.stringify({log:{disabled:true},outbounds:[outbound]}));
            const result=spawnSync(bin,['check','-c',path],{encoding:'utf8',timeout:10000});
            if (result.status!==0) throw new Error(item.name+': '+result.stderr+' '+String(result.error || ''));
            console.log('PASS '+item.name); checks++;
        }
    }
    console.log(`${checks} real engine config checks passed (no network connections).`);
} finally {rmSync(temp,{recursive:true,force:true});}
