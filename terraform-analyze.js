#!/usr/bin/env node

const { table } = require('table')
const chalk = require('chalk');

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

const getTimeColor = (parsedTime) => {
    if (parsedTime > 10 * 60) return chalk.red;
    if (parsedTime > 5 * 60) return chalk.yellow;
    return chalk.green;
}

const analyzeTerraformOutput = (output) => {
    try {
        const moduleToTimeMap = {}
        output
            .split('\n')
            .forEach((line, i) => {
                const lineMatch = line.match(/(module.*): Creation complete after (\d.*) \[/);

                if (lineMatch) {
                    const [, moduleName, elapsedTime] = lineMatch;
                    moduleToTimeMap[moduleName] = elapsedTime;
                }
            });

        const entries = Object.entries(moduleToTimeMap);
        if (!entries.length) return;

        const parsedEntries = entries
            .map(entry => [entry[0], { parsed: parseTerraformTime(entry[1]), elapsed: entry[1] }])
            .filter(entry => entry[1].parsed > 10);
        parsedEntries.sort((a, b) => b[1].parsed - a[1].parsed)
        const tableData = [
            ['Module Name', 'Time'],
            ...parsedEntries.map(entry => [entry[0], getTimeColor(entry[1].parsed)(entry[1].elapsed)])
        ];
        console.log('Top long resource creation:')
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