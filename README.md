# facial-tension-observer

> Registros involuntários de momentos delicados. Um observador fotográfico reativo e privado que monitora micromovimentos de tensão facial e confronta o usuário com uma escolha binária sem preview: apagar no escuro ou manter para a posteridade.

Aplicativo mobile local-first desenvolvido em React Native e TypeScript que utiliza visão computacional on-device (ML Kit Face Mesh) para detectar picos sustentados de rigidez muscular facial e efetuar capturas silenciosas, sem expor espelho de câmera na tela e sem transmitir dados para a nuvem.

---

## Estrutura do Projeto

```text
facial-tension-observer/
├── jest.config.js
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   └── core/
│       ├── geometry.ts
│       ├── heuristics.ts
│       ├── tracker.ts
│       └── types.ts
└── tests/
    ├── fixtures/
    │   └── mock_meshes.ts
    └── unit/
        ├── geometry.test.ts
        ├── heuristics.test.ts
        ├── tracker.test.ts
        └── types.test.ts
```
