// ESLint 9 (configuración plana) con la guía de estilo de Airbnb (eslint-config-airbnb-base) adaptada a Fusa Conecta.
// Prettier se encarga del formato (eslint-config-prettier apaga las reglas de formato de Airbnb).
// Ver docs/estandares.md: qué reglas se adaptaron y por qué.
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname, recommendedConfig: js.configs.recommended });

// La PWA carga sus scripts en orden (datos.js → icons.js → app.js) sin módulos: estas son sus variables globales
const globalesPWA = {
  firebase: 'readonly',
  L: 'readonly',
  maplibregl: 'readonly',
  umami: 'readonly',
  QRCode: 'readonly',
  jsQR: 'readonly',
  CAT: 'readonly',
  SUBCATS: 'readonly',
  PLAZA_FUSA: 'readonly',
  COMERCIOS_BASE: 'readonly',
  RUTAS: 'readonly',
  EMERGENCIAS: 'readonly',
  ICONOS: 'readonly',
  icon: 'readonly',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'api/.venv/**',
      '**/.venv/**',
      'android/**',
      'lib/**',
      '.firebase/**',
      'video-publicitario/**',
      '**/*.min.js',
    ],
  },
  ...compat.extends('airbnb-base'),
  prettier,
  {
    // Reglas de Airbnb adaptadas (explicadas en docs/estandares.md)
    rules: {
      'no-plusplus': 'off', // i++ en los ciclos for es claro
      'no-param-reassign': ['error', { props: false }], // se permite modificar propiedades (DOM, objetos de estado)
      'no-use-before-define': ['error', { functions: false, classes: true, variables: false }], // funciones declaradas al final
      'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'], // for…of sí se permite
      'no-nested-ternary': 'off', // textos de la interfaz con varias variantes
      'no-continue': 'off',
      'no-await-in-loop': 'off', // pasos que deben ir en orden (pruebas del Diagnóstico, lotes)
      'no-alert': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-destructuring': 'off',
      'consistent-return': 'off', // funciones que salen temprano con return;
      'no-underscore-dangle': [
        'error',
        {
          allow: ['_coords', '_raw', '_semilla', '_apps', '_t', '_id', '_deb', '_procesarUsuario', '__d', '__archivos'],
        },
      ],
      'no-cond-assign': ['error', 'except-parens'], // while((m=re.exec(t))) para recorrer coincidencias
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'import/extensions': ['error', 'ignorePackages'],
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      'import/prefer-default-export': 'off',
      'func-names': 'off',
      'no-bitwise': 'off', // códigos QR y cálculo de huellas
      'no-shadow': ['error', { builtinGlobals: false, hoist: 'never' }],
      // La interfaz se arma concatenando HTML corto ('<b>'+esc(x)+'</b>'): convertir ~900 concatenaciones que funcionan
      // a plantillas no mejora la lectura y arriesga la PWA; el código nuevo puede usar plantillas
      'prefer-template': 'off',
      'one-var': 'off', // const a=1,b=2; agrupa datos de un mismo cálculo
      'no-return-assign': ['error', 'except-parens'], // permite (b)=>(b.onclick=…) y el patrón b=>b.onclick=… se revisa
      'no-empty': ['error', { allowEmptyCatch: true }], // try{localStorage…}catch(e){} en navegación privada
      'no-multi-assign': ['error', { ignoreNonDeclaration: true }],
    },
  },
  {
    // PWA: scripts clásicos del navegador que comparten variables globales entre archivos
    files: ['app.js', 'datos.js', 'icons.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2023,
      parserOptions: { sourceType: 'script', ecmaFeatures: { globalReturn: false } },
      globals: { ...globals.browser, ...globalesPWA },
    },
    rules: {
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }], // lo global lo usan los otros archivos
      'no-redeclare': ['error', { builtinGlobals: false }],
      // Normalizar argumentos al entrar (texto=String(texto||'').trim()) es intencional; mutar propiedades ya se permite arriba
      'no-param-reassign': 'off',
      'vars-on-top': 'off',
      strict: 'off',
    },
  },
  {
    files: ['sw.js', 'herramientas/**/sw.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2023,
      parserOptions: { sourceType: 'script', ecmaFeatures: { globalReturn: false } },
      globals: { ...globals.serviceworker },
    },
    rules: { 'no-restricted-globals': ['error', 'event'] },
  },
  {
    // Herramientas y pruebas en Node (módulos ES)
    files: ['**/*.mjs', 'eslint.config.js'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2023, globals: { ...globals.node } },
    rules: { 'no-new-func': 'off' }, // paridad_js.mjs evalúa funciones de la versión anterior a propósito
  },
];
