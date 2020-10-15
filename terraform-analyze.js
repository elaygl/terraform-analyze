#!/usr/bin/env node

const { table } = require('table')

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

const analyzeTerraformOutput = (output) => {
    const moduleToTimeMap = {}
    output
        .split('\n')
        .forEach((line, i) => {
            const lineMatch = line.match(/(module.*): (Still creating...) \[(.*) elapsed\]/);
            if (lineMatch) {
                const [, moduleName, , elapsedTime] = lineMatch;
                moduleToTimeMap[moduleName] = elapsedTime;
            }
        });

    const entries = Object.entries(moduleToTimeMap);
    if (!entries.length) return;

    const parsedEntries = entries.map(entry => [entry[0], { parsed: parseTerraformTime(entry[1]), elapsed: entry[1] }]);
    parsedEntries.sort((a, b) => b[1].parsed - a[1].parsed)
    const tableData = [
        ['Module Name', 'Time'],
        ...parsedEntries.map(entry => [entry[0], entry[1].elapsed])
    ];
    console.log('Top long resource creation:')
    console.log(table(tableData));
}

let data = '';
process.stdin.on('data', function (chunk) {
    data += chunk;
});

process.stdin.on('end', function () {
    analyzeTerraformOutput(data)
});