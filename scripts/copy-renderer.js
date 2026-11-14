const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const destination = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
