// Pruebas unitarias de JavaScript (Vitest). La PWA calcula horarios con la hora local: se fija la de Colombia.
import { defineConfig } from 'vitest/config';

process.env.TZ = 'America/Bogota';

export default defineConfig({
  test: {
    include: ['pruebas/unitarias/**/*.test.js'],
    environment: 'node',
    reporters: ['default', 'junit', 'html'],
    outputFile: { junit: 'informe-pruebas/js-unitarias.xml', html: 'informe-pruebas/js-unitarias/index.html' },
  },
});
