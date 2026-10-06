# audit/starter-check

Theme declarativo basado en el renderer classic@1.

1. Personaliza manifest.json: metadata, tokens y presets; no copies checkout ni catálogo.
2. Ejecuta npm run theme:check -- theme-starters/audit-starter-check/manifest.json desde la raíz.
3. Añade el manifiesto validado a packages/themes/catalog.json para integrarlo al build.
4. Ejecuta theme:test, builds y pruebas de aislamiento. Selecciona el theme en el panel y revisa el borrador antes de publicar.

Consulta docs/THEMES.md para identidad, versionado, migraciones, preview, tokens, a11y y límites de seguridad.
