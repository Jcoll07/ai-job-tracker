# JobTrackr para macOS

Este directorio crea un lanzador `.app` para usar JobTrackr como una aplicación normal de macOS.

## Instalación (una sola vez)

Desde la raíz del repositorio:

```bash
bash scripts/macos/install-jobtrackr-app.sh
```

El instalador crea `~/Applications/JobTrackr.app`. Después puedes arrastrarlo al Dock.

## Uso diario

Doble clic en **JobTrackr**. El lanzador comprueba si el servidor local ya está activo, lo inicia si es necesario y abre JobTrackr en Safari.

No se configura ningún inicio automático al arrancar macOS.

## Seguridad

El servidor se inicia en `127.0.0.1:3001`, por lo que el acceso queda limitado al propio Mac. El proceso permanece ejecutándose aunque se cierre Safari; si quieres detenerlo manualmente, usa `Ctrl+C` en una terminal o termina el proceso de JobTrackr.
