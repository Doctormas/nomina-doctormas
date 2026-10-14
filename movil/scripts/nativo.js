// Se corre DESPUÉS de `npx cap add android`: mete en el proyecto Android lo
// propio de esta app (plugin de impresión a PDF, íconos, versión) y deja
// el permiso/ajustes que hacen falta. Es idempotente.
'use strict';
const fs = require('fs');
const path = require('path');

const movil = path.resolve(__dirname, '..');
const android = path.join(movil, 'android');
const paquete = 'com/doctormas/nomina';
const javaDir = path.join(android, 'app/src/main/java', paquete);
const resDir = path.join(android, 'app/src/main/res');

if (!fs.existsSync(android)) throw new Error('No existe movil/android: corra `npx cap add android` primero.');

// 1) Plugin de impresión + MainActivity que lo registra
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(movil, 'nativo/PdfPrintPlugin.java'), path.join(javaDir, 'PdfPrintPlugin.java'));
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), `package com.doctormas.nomina;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

// 2) Íconos del lanzador (se usan los PNG normales: se quita el ícono adaptativo)
const iconos = path.join(movil, 'nativo/iconos');
for (const d of fs.readdirSync(iconos)) {
  const destino = path.join(resDir, d);
  fs.mkdirSync(destino, { recursive: true });
  for (const f of fs.readdirSync(path.join(iconos, d))) fs.copyFileSync(path.join(iconos, d, f), path.join(destino, f));
}
fs.rmSync(path.join(resDir, 'mipmap-anydpi-v26'), { recursive: true, force: true });

// 3) Versión de la app = versión del package.json de la raíz
const pkg = JSON.parse(fs.readFileSync(path.resolve(movil, '..', 'package.json'), 'utf-8'));
const [maj, min, pat] = pkg.version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;
const gradlePath = path.join(android, 'app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf-8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradlePath, gradle);

console.log(`[nativo] listo: versión ${pkg.version} (code ${versionCode})`);
