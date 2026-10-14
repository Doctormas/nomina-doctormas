// Copia el código de la app (../src) a ./www, que es lo que Capacitor mete en el APK,
// y escribe version.json con la versión del package.json de la raíz.
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..', '..');
const origen = path.join(raiz, 'src');
const destino = path.resolve(__dirname, '..', 'www');

fs.rmSync(destino, { recursive: true, force: true });
fs.cpSync(origen, destino, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf-8'));
fs.writeFileSync(path.join(destino, 'version.json'), JSON.stringify({ version: pkg.version }) + '\n');
console.log('[preparar] www listo, versión', pkg.version);
