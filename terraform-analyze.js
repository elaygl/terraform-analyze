#!/usr/bin/env node

const { table } = require('table')
const chalk = require('chalk');
const fs = require('fs');
const pug = require('pug');
const path = require('path');

const REPORT_DIR = './report';

process.stdin.resume();
process.stdin.setEncoding('utf8');

const parseTerraformTime = (tfTime) => {
    const timeMatch = tfTime.match(/(\d*\D)/g);
    let timeValue = 0;
    timeMatch.forEach(timePeace => {
        const unit = timePeace.slice(-1);
        if (unit === 'h') timeValue += parseInt(timePeace) * 60 * 60;
        else if (unit === 'm') timeValue += parseInt(timePeace) * 60;
        else if (unit === 's') timeValue += parseInt(timePeace);
    })
    return timeValue;
}

const getTimeColorChalk = (parsedTime) => {
    if (parsedTime > 10 * 60) return chalk.red;
    if (parsedTime > 5 * 60) return chalk.yellow;
    return chalk.green;
}

const getTimeColorString = (parsedTime) => {
    if (parsedTime > 10 * 60) return 'red';
    if (parsedTime > 5 * 60) return '#9c9c22';
    return 'green';
}

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

const analyzeTerraformOutput = (output) => {
    try {
        const modules = {}
        try {fs.mkdirSync(REPORT_DIR);} catch (e) {}
        output
            .split('\n')
            .forEach((line, i) => {
                const lineMatch = line.match(/((?:.\[[0-9]{1,3}m)*)([^:]*): ([^]*)((?:.\[[0-9]{1,3}m)*)/);

                if (lineMatch) {
                    let [, startColor, moduleName, body, endColor] = lineMatch;

                    if(moduleName && moduleName !== '') {
                        const matchLocalExec = moduleName.match(/([^ ]*) ?(?:(\(local-exec\))?)$/);
                        const [, moduleNameWithoutLocalExec, localExec] = matchLocalExec;

                        if(!modules[moduleNameWithoutLocalExec]) {
                            modules[moduleNameWithoutLocalExec] = {
                                fileName: path.join(moduleNameWithoutLocalExec.replace(/[^a-z0-9._-]/gi, '_').toLowerCase(), 'terraform.html'),
                                moduleName: moduleNameWithoutLocalExec,
                                elapsedTime: '0s',
                                parsedTime: 0,
                                colorChalk: getTimeColorChalk(0),
                                colorHtml: getTimeColorString(0)
                            }
                        }

                        if(localExec) {
                            if(!modules[moduleNameWithoutLocalExec].localExec) modules[moduleNameWithoutLocalExec].localExec = {};
                            const localExec = modules[moduleNameWithoutLocalExec].localExec

                            if(body.includes('Executing:')) {
                                const [,executing] = body.match(/^Executing: \[\"\/bin\/sh\" "-c" "(.*)\"\]$/);
                                localExec.executing = {};
                                localExec.executing.fileName = path.join(moduleNameWithoutLocalExec.replace(/[^a-z0-9._-]/gi, '_').toLowerCase(), 'executing.html')
                                localExec.executing.body = executing.split('\\n').map((data) => ({body: data}));
                            }

                            if(!localExec.body) localExec.body = [];
                            localExec.body.push({body, startColor, endColor});
                            localExec.fileName = path.join(moduleNameWithoutLocalExec.replace(/[^a-z0-9._-]/gi, '_').toLowerCase(),'localExec.html')
                        } else {
                            if(body.includes('Creation complete after')) {
                                const creationCompleteMatch = body.match(/Creation complete after (\d.*) \[/);
                                const [, elapsedTime] = creationCompleteMatch
                                modules[moduleNameWithoutLocalExec].elapsedTime = elapsedTime;
                                modules[moduleNameWithoutLocalExec].parsedTime = parseTerraformTime(elapsedTime);
                                modules[moduleNameWithoutLocalExec].colorChalk = getTimeColorChalk(modules[moduleNameWithoutLocalExec].parsedTime);
                                modules[moduleNameWithoutLocalExec].colorHtml = getTimeColorString(modules[moduleNameWithoutLocalExec].parsedTime);
                            }

                            if(!modules[moduleNameWithoutLocalExec].body) modules[moduleNameWithoutLocalExec].body = [];
                            modules[moduleNameWithoutLocalExec].body.push({body, startColor, endColor});
                        }
                    }
                }
            });

        const tableData = [
            ['Module Name', 'Time'],
            ...Object.entries(modules)
                   .filter(entry => entry[1].parsedTime > 10)
                   .sort((a, b) => b[1].parsedTime - a[1].parsedTime)
                    .map(entry => entry[1])
                    .map(entry => [entry.moduleName, entry.colorChalk(entry.elapsedTime)])
        ];
        console.log('Top long resource creation:')



        fs.writeFileSync(path.join(REPORT_DIR,'index.html'), pug.renderFile('templates/table.pug', {
            values: Object.entries(modules)
            .sort((a, b) => b[1].parsedTime - a[1].parsedTime)
            .map(entry => ({
                module: entry[1].moduleName,
                link: entry[1].fileName,
                linkLocalExec: entry[1].localExec ? entry[1].localExec.fileName : undefined,
                linkExecuting: entry[1].localExec && entry[1].localExec.executing ? entry[1].localExec.executing.fileName : undefined,
                time: entry[1].elapsedTime,
                color: entry[1].colorHtml
        }))}));

        Object.entries(modules).forEach(([key,value]) => {
            const fileNameTerraform = path.join(REPORT_DIR, value.fileName);
            ensureDirectoryExistence(fileNameTerraform)

            fs.writeFileSync(fileNameTerraform, pug.renderFile('templates/log.pug', {
                module: value.moduleName,
                time: value.elapsedTime,
                body: value.body.map((data) => data.body).join('\n')
            }));

            if(value.localExec) {
                const fileNameLocalExec = path.join(REPORT_DIR, value.localExec.fileName);
                fs.writeFileSync(fileNameLocalExec, pug.renderFile('templates/log.pug', {
                    module: value.moduleName,
                    time: value.elapsedTime,
                    body: value.localExec.body.map((data) => data.body).join('\n')
                }));

                if(value.localExec.executing) {
                    const fileNameExecuting = path.join(REPORT_DIR, value.localExec.executing.fileName);
                    fs.writeFileSync(fileNameExecuting, pug.renderFile('templates/log.pug', {
                        module: value.moduleName,
                        time: value.elapsedTime,
                        body: value.localExec.executing.body.map((data) => data.body).join('\n')
                    }));
                }
            }
        })

        console.log(table(tableData));
    } catch (err) {
        console.error('failed to analyze terraform output', err);
    }
}

let data = '';
process.stdin.on('data', function (chunk) {
    process.stdout.write(chunk);
    data += chunk;
});

process.stdin.on('end', function () {
    analyzeTerraformOutput(data)
});