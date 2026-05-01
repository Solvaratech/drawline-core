import fs from 'fs';
import path from 'path';

const datasetsDir = path.join(process.cwd(), 'src/generator/datasets');

// Process Global Names
const globalNamesRaw = fs.readFileSync(path.join(process.cwd(), '.system_generated/steps/787/content.md'), 'utf-8');
const globalNames = globalNamesRaw.split('\n').slice(5).map(n => n.trim()).filter(n => n.length > 2 && !n.includes(' '));
fs.writeFileSync(path.join(datasetsDir, 'names_global.json'), JSON.stringify(globalNames.slice(0, 5000)));

// Process Indian Names
const indianNamesRaw = fs.readFileSync(path.join(process.cwd(), '.system_generated/steps/808/content.md'), 'utf-8');
const indianNames = indianNamesRaw.split('\n').slice(5).map(line => {
    const parts = line.split(',');
    return parts[0] ? parts[0].trim() : null;
}).filter(n => n && n.length > 2);
fs.writeFileSync(path.join(datasetsDir, 'names_indian.json'), JSON.stringify(indianNames.slice(0, 5000)));

// Process Job Titles
const jobTitlesRaw = fs.readFileSync(path.join(process.cwd(), '.system_generated/steps/817/content.md'), 'utf-8');
const jobTitlesObj = JSON.parse(jobTitlesRaw.split('\n').slice(4).join('\n'));
fs.writeFileSync(path.join(datasetsDir, 'job_titles.json'), JSON.stringify(jobTitlesObj['job-titles'].slice(0, 5000)));

console.log('Datasets processed successfully!');
