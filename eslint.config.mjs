import globals from 'globals';

/**
 * Lint focado em código morto por arquivo (SPA com scripts globais via bootstrap).
 * Apenas avisos de símbolos não usados; sem `recommended` (evita ruído no legado e em vendor).
 */
export default [
    {
        ignores: [
            'js/.DS_Store',
            'js/vendor/**'
        ]
    },
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.es2021
            }
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    caughtErrors: 'none',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_'
                }
            ],
            'no-unreachable': 'warn'
        }
    },
    {
        files: ['js/view3d/view3d-three-viewer.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2021
            }
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    args: 'after-used',
                    caughtErrors: 'none',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_'
                }
            ]
        }
    }
];
