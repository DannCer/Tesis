// server-scanner.js
const express = require('express');
const fs = require('fs');
const app = express();

app.get('/scan-projects', (req, res) => {
    const files = fs.readdirSync('C:/mis_proyectos');
    const projects = files.filter(f => f.endsWith('.qgz')).map(f => ({
        name: f.replace('.qgz', ''),
        path: `C:/mis_proyectos/${f}`
    }));
    res.json(projects);
});

app.listen(3001, () => console.log('Escáner de proyectos en puerto 3001'));