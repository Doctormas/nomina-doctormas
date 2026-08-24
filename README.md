# Nómina Doctormás (escritorio)

Sistema de nómina conforme a la LOTTT (Venezuela), ahora como aplicación de escritorio (Electron) para Doctormás — antes vivía como un único archivo HTML que se abría en el navegador.

## Qué cambió respecto a la versión web

- **App de escritorio real** (Electron): se instala, tiene su propio ícono, menú nativo (Archivo/Edición/Ver/Ayuda) y ventana, en vez de una pestaña del navegador.
- **Datos en un archivo local**, no en el navegador: viven en `nomina-data.json` dentro de la carpeta de datos de la app (Archivo → *Abrir carpeta de datos*). Ya no dependen de "no borrar el caché del navegador".
- **PDF nativo**: los recibos/informes se generan con el motor de impresión de Electron en vez de `html2canvas`/`html2pdf.js` — esa librería era la causa raíz, documentada en el historial de versiones original, de meses de "PDF en blanco". Con el nuevo método siempre se guarda con un diálogo nativo "Guardar como".
- **Interfaz rediseñada**: navegación en barra lateral (patrón de app de escritorio), sistema de botones/tablas/tarjetas más pulido, y toasts/diálogos de confirmación propios en vez de los `alert()`/`confirm()` del navegador.
- **Carga masiva de empleados** (Excel/CSV) y fuentes tipográficas (Cormorant Garamond, Roboto) quedaron empaquetadas localmente — ya no dependen del CDN ni de Google Fonts para funcionar.
- **Toda la lógica legal (LOTTT) se portó tal cual** — nómina, vacaciones, bono vacacional, utilidades, prestaciones sociales (Art. 142) y liquidación — reorganizada en módulos pero con la misma aritmética. Al portarla se encontró y corrigió un bug real y preexistente en el cálculo de intereses de prestaciones sociales: por un error de tipos (se le pasaba una fecha como objeto `Date` a una función que esperaba texto), los intereses acumulados daban `NaN`, y como el formateador de moneda oculta `NaN` mostrándolo como `Bs. 0,00`, el error pasaba desapercibido — el "Monto a pagar" de Prestaciones sociales y de Liquidación se veía con Bs. 0,00 de intereses en vez del monto real. Ya está corregido y verificado con una batería de pruebas automatizadas.
- La tasa BCV (`ve.dolarapi.com`) y la sincronización en la nube con el Worker de Cloudflare del equipo funcionan exactamente igual que antes — mismos endpoints, mismo protocolo.

## Desarrollo

Requiere Node.js (usado: v24) y npm.

```bash
npm install
npm start
```

`npm run dev` abre además las DevTools y registra en consola cualquier error del renderer.

## Empaquetar (crear el instalador)

```bash
npm run dist:mac    # .dmg para macOS
npm run dist:win    # instalador .exe (nsis) para Windows
npm run dist        # ambos, si se corre en un entorno que pueda generar los dos
```

Los instaladores quedan en `dist/`.

## Dónde viven los datos

Menú **Archivo → Abrir carpeta de datos** abre la carpeta donde vive `nomina-data.json` (la ubicación estándar de datos de apps de Electron: `~/Library/Application Support/nomina-doctormas` en macOS, `%APPDATA%\nomina-doctormas` en Windows).

**Recomendación:** exporten un respaldo (`Archivo → Guardar respaldo como…`, o el botón en Resumen) con frecuencia, sobre todo antes de reinstalar o migrar a otro computador. Un respaldo `.json` exportado desde la versión web anterior también se puede importar tal cual — mismo formato.

## Publicar una actualización (Windows)

Las PC con la app instalada tienen un botón **Configuración → Actualizaciones → Buscar actualizaciones** que revisa GitHub Releases de este repositorio, descarga la versión nueva sola y queda lista para instalarse al reiniciar. Para publicar una:

1. Suban el cambio a `main` como de costumbre.
2. Suban de versión en `package.json` (ej. `1.0.0` → `1.1.0`) y hagan commit.
3. Etiqueten esa versión y suban la etiqueta:
   ```bash
   git tag v1.1.0
   git push origin main --tags
   ```
4. Eso dispara el workflow `.github/workflows/release.yml` en GitHub Actions: compila el instalador de Windows en un runner de GitHub (no hace falta Wine ni una PC con Windows a mano) y lo publica en **Releases** del repositorio.
5. En cada PC, quien le dé clic a "Buscar actualizaciones" la va a encontrar y descargar sola.

Nada de esto requiere pegar ningún token a mano — el workflow usa el `GITHUB_TOKEN` que GitHub Actions provee automáticamente. Solo hace falta que el número de versión de la etiqueta (`vX.Y.Z`) coincida con el de `package.json`.

En **Mac** el botón solo avisa que hay una versión nueva (no la instala sola) — instalar-solo requiere firmar la app con un certificado de Apple Developer (US$99/año), que este proyecto no tiene configurado.

## Sincronización en equipo

Si ya tenían desplegado el Worker de Cloudflare (`nomina-sync-worker/`) para compartir datos entre 2–3 personas, sigue funcionando igual: en **Configuración → Sincronización en la nube**, cada persona pega la misma URL y PIN una vez. El servidor (Worker) en sí no cambió — sigue siendo responsabilidad de ese proyecto aparte.

## Estructura del proyecto

```
electron/        proceso principal (ventana, menú, IPC, PDF nativo, almacenamiento)
src/
  index.html      shell de la app
  app.js          arranque, barra lateral, router de secciones
  styles/         sistema de diseño (CSS)
  state/store.js  estado en memoria + persistencia
  lib/            fórmulas LOTTT, formato, tasa BCV, sincronización, plantillas de PDF/CSV
  components/     toast, confirmación, iconos, bloque de "resultado con acciones"
  views/          una vista por sección (Resumen, Configuración, Empleados, Nómina, …)
  assets/fonts/   tipografías empaquetadas localmente
assets/icons/     ícono de la app (placeholder — reemplazar por diseño final)
```
