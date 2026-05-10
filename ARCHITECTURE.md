# Plan: Refaktor konfiguratora drabin do Vue 3 + TypeScript + Vite

## Cel
Przepisanie obecnego konfiguratora (konfigurator.html + iframe drabiny_3d) na nowoczesną, zintegrowaną aplikację Vue 3 z TypeScript i Vite. Eliminacja problemów synchronizacji iframe, czysta architektura, łatwy rozwój.

## Stack technologiczny
- **Vue 3** - Composition API
- **TypeScript** - pełne typowanie
- **Pinia** - state management (zamiennik dla Vuex)
- **Vite** - bundler (szybki dev server, HMR)
- **Three.js** - bezpośrednia integracja (bez iframe)
- **Axios** - HTTP client dla API

## Struktura katalogów

```
drabiny_kalkulator_v2/
├── src/
│   ├── main.ts                    # Entry point
│   ├── App.vue                    # Root component
│   │
│   ├── types/                     # TypeScript interfaces
│   │   ├── ladder.ts              # LadderConfig, LadderType, Scheme
│   │   ├── three-d.ts             # ThreeDState, ConnectorType, WspornikType
│   │   ├── components.ts          # Component, Specification
│   │   ├── pricing.ts             # PriceResult, Discount
│   │   └── obstacles.ts           # Obstacle, ObstacleType
│   │
│   ├── stores/                    # Pinia stores
│   │   ├── config.store.ts        # Konfiguracja drabiny (wysokość, typ, etc.)
│   │   ├── three-d.store.ts       # Stan 3D (ilości modułów, łączniki, wsporniki)
│   │   ├── pricing.store.ts       # Ceny, rabaty, promocje
│   │   ├── ui.store.ts            # Stan UI (aktywny krok, modals, loading)
│   │   └── obstacles.store.ts     # Przeszkody na drabinie
│   │
│   ├── composables/               # Logika biznesowa (composables)
│   │   ├── useLadderCalculator.ts # Obliczenia modułów (X7, X8, szczebli)
│   │   ├── useObstacleCollision.ts # Wykrywanie kolizji przeszkód
│   │   ├── useSpecification.ts    # Generowanie listy komponentów
│   │   ├── usePriceCalculator.ts  # Obliczanie cen
│   │   └── useValidation.ts       # Walidacja inputów
│   │
│   ├── three/                     # Three.js integration
│   │   ├── ThreeScene.ts          # Klasa główna sceny
│   │   ├── models/                # Definicje modeli 3D
│   │   │   ├── LadderModel.ts     # Model drabiny
│   │   │   ├── ConnectorModel.ts  # Model łącznika
│   │   │   ├── WspornikModel.ts   # Model wspornika
│   │   │   ├── CageModel.ts       # Model kosza bezpieczeństwa
│   │   │   └── ObstacleModel.ts   # Model przeszkody
│   │   ├── useThreeScene.ts       # Composable dla Vue
│   │   └── constants.ts           # Stałe (wymiary, kolory)
│   │
│   ├── components/                # Vue components
│   │   ├── configurator/
│   │   │   ├── ConfiguratorView.vue    # Główny widok
│   │   │   ├── StepIndicator.vue       # Wskaźnik kroków
│   │   │   ├── LadderTypeSelector.vue  # Wybór typu drabiny
│   │   │   ├── HeightInput.vue         # Input wysokości
│   │   │   ├── SchemeSelector.vue      # Wybór zakończenia
│   │   │   ├── CageSelector.vue        # Wybór kosza
│   │   │   └── ObstacleEditor.vue      # Edycja przeszkód
│   │   │
│   │   ├── three-d/
│   │   │   ├── ThreeCanvas.vue         # Canvas Three.js
│   │   │   ├── ViewControls.vue        # Kontrolki widoku (zoom, rotate)
│   │   │   └── LadderInfo.vue          # Info o module pod kursorem
│   │   │
│   │   ├── summary/
│   │   │   ├── SummaryPanel.vue        # Panel podsumowania
│   │   │   ├── ComponentsList.vue      # Lista komponentów
│   │   │   ├── PriceDisplay.vue        # Wyświetlanie ceny
│   │   │   └── PromoCodeInput.vue      # Pole kodu promocyjnego
│   │   │
│   │   └── common/
│   │       ├── BaseButton.vue
│   │       ├── BaseInput.vue
│   │       ├── BaseSelect.vue
│   │       └── Modal.vue
│   │
│   ├── services/                  # API services
│   │   ├── api.client.ts          # Axios instance, interceptors
│   │   ├── calculate.service.ts   # /api/calculate.php
│   │   ├── config.service.ts      # /api/save-configuration.php
│   │   └── pricing.service.ts     # /api/pricing.php
│   │
│   └── utils/                     # Helpers
│       ├── formatters.ts          # formatPrice, formatDimension
│       └── validators.ts          # validateHeight, validateNIP
│
├── public/
│   └── models/                    # Pliki 3D (.glb)
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env
```

## Kluczowe typy TypeScript

### types/ladder.ts
```typescript
export type LadderType = 'facade' | 'chimney';
export type Scheme = 'with-platform' | 'no-platform';
export type CageOption = 'no-cage' | 'from-3m' | 'from-ground';

export interface LadderConfig {
  type: LadderType;
  wallHeight: number;           // wysokość ściany w metrach
  scheme: Scheme;
  cage: CageOption;
  surfaceType: 'smooth' | 'rough';
  bracketType: string;
}
```

### types/three-d.ts
```typescript
export interface ThreeDState {
  numX7Ladders: number;
  numX8Ladders: number;
  finalLadderRungs: number;
  totalRungs: number;
  safetyCageCount: number;
  connectorTypes: ConnectorType[];
  wspornikTypes: WspornikType[];
}

export type ConnectorType = 'modulowy' | 'scienny' | 'dachowy' | 'kominowy' | 'attykowy';
export type WspornikType = 'standard' | 'regulowany' | 'attykowy';
```

## Pinia Stores

### stores/config.store.ts
```typescript
export const useConfigStore = defineStore('config', () => {
  const config = ref<LadderConfig>({
    type: 'facade',
    wallHeight: 5,
    scheme: 'no-platform',
    cage: 'no-cage',
    surfaceType: 'smooth',
    bracketType: 'standard'
  });

  const ladders = ref<Ladder[]>([]);
  const editingLadderIndex = ref<number | null>(null);

  // Actions
  function setConfig(newConfig: Partial<LadderConfig>) { ... }
  function addLadder(ladder: Ladder) { ... }
  function updateLadder(index: number, ladder: Ladder) { ... }
  function removeLadder(index: number) { ... }

  return { config, ladders, editingLadderIndex, setConfig, addLadder, ... };
});
```

### stores/three-d.store.ts
```typescript
export const useThreeDStore = defineStore('threeD', () => {
  const state = ref<ThreeDState>({ ... });
  const obstacles = ref<Obstacle[]>([]);

  // Reaktywne obliczenia - automatycznie aktualizują 3D
  const totalHeight = computed(() => ...);

  function updateFromCalculation(spec: Specification) { ... }
  function addObstacle(obstacle: Obstacle) { ... }
  function removeObstacle(id: string) { ... }

  return { state, obstacles, totalHeight, ... };
});
```

## Integracja Three.js

### three/ThreeScene.ts
```typescript
export class ThreeScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private loader: GLTFLoader;

  constructor(container: HTMLElement) { ... }

  // Metody reaktywne - wywoływane przez Vue watch
  renderLadder(config: LadderConfig, state: ThreeDState): void { ... }
  updateConnectors(types: ConnectorType[]): void { ... }
  updateWsporniki(types: WspornikType[]): void { ... }
  updateCage(count: number): void { ... }

  dispose(): void { ... }
}
```

### three/useThreeScene.ts (composable)
```typescript
export function useThreeScene(containerRef: Ref<HTMLElement | null>) {
  const configStore = useConfigStore();
  const threeDStore = useThreeDStore();

  let scene: ThreeScene | null = null;

  onMounted(() => {
    scene = new ThreeScene(containerRef.value!);
  });

  // Reaktywne aktualizacje - kluczowa zaleta nowej architektury
  watch(() => configStore.config, (newConfig) => {
    scene?.renderLadder(newConfig, threeDStore.state);
  }, { deep: true });

  watch(() => threeDStore.state.safetyCageCount, (count) => {
    scene?.updateCage(count);
  });

  onUnmounted(() => {
    scene?.dispose();
  });

  return { /* metody kontroli kamery, etc. */ };
}
```

## Composables - logika biznesowa

### composables/useLadderCalculator.ts
```typescript
export function useLadderCalculator() {
  const configStore = useConfigStore();
  const threeDStore = useThreeDStore();

  function calculate(): Specification {
    const { wallHeight, scheme, cage } = configStore.config;

    // Logika przeniesiona z obecnego konfigurator.html
    const totalHeightMm = wallHeight * 1000;
    const numX7 = Math.floor(totalHeightMm / 1925);
    // ... reszta obliczeń

    return { numX7, numX8, finalRungs, components, ... };
  }

  // Automatyczne przeliczanie przy zmianie konfiguracji
  watch(() => configStore.config, () => {
    const spec = calculate();
    threeDStore.updateFromCalculation(spec);
  }, { deep: true });

  return { calculate };
}
```

## Przepływ danych (reaktywny)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   UI Components │────►│  Pinia Stores   │────►│   Three.js      │
│   (Vue 3)       │     │  (reaktywny)    │     │   (renderuje)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   Użytkownik            Composables              Wizualizacja
   zmienia input    →    obliczają nowy      →    aktualizuje
                         stan                     automatycznie
```

**Kluczowa różnica vs obecna architektura:**
- Teraz: `konfigurator.html` → postMessage → `iframe (drabiny_3d)` → postMessage → aktualizacja
- Nowa: `configStore.setConfig()` → watch w composable → `threeDStore.update()` → watch w ThreeCanvas → renderuj

## Fazy implementacji

### Faza 1: Szkielet projektu
1. Inicjalizacja Vite + Vue 3 + TypeScript
2. Konfiguracja Pinia
3. Podstawowe typy TypeScript
4. Struktura katalogów

### Faza 2: Stores i logika
1. `useConfigStore` - stan konfiguracji
2. `useThreeDStore` - stan 3D
3. `useLadderCalculator` - przeniesienie logiki obliczeń
4. `useSpecification` - generowanie listy komponentów

### Faza 3: Integracja Three.js
1. `ThreeScene` class - podstawowa scena
2. Ładowanie modeli 3D (skopiowane z drabiny_3d)
3. `useThreeScene` composable
4. `ThreeCanvas.vue` component

### Faza 4: Komponenty UI
1. Podstawowe komponenty (BaseButton, BaseInput)
2. `ConfiguratorView.vue` - główny layout
3. `LadderTypeSelector`, `HeightInput`, etc.
4. `SummaryPanel` z listą komponentów

### Faza 5: API i finalizacja
1. Services dla API (calculate, save, pricing)
2. Obsługa błędów i loading states
3. Promocje i kody rabatowe
4. Testy manualne

## Pliki źródłowe do migracji

### Z konfigurator.html:
- `state` object → `useConfigStore`
- `iframe3dState` → `useThreeDStore`
- `calculateModules()` → `useLadderCalculator`
- `updateSpecification()` → `useSpecification`
- `generateComponentsList()` → `useSpecification`
- Walidacje → `useValidation`
- HTML formularza → Vue components

### Z drabiny_3d/index.html:
- `createLadder()` → `ThreeScene.renderLadder()`
- `createConnector()` → `ConnectorModel.ts`
- `createWspornik()` → `WspornikModel.ts`
- `renderSafetyCage()` → `CageModel.ts`
- Modele 3D (.glb) → `public/models/`

## Weryfikacja

### Testy manualne
1. `npm run dev` - uruchom dev server
2. Skonfiguruj różne typy drabin (fasadowa, kominowa)
3. Zmień wysokość - sprawdź czy 3D aktualizuje się natychmiast
4. Dodaj przeszkody - sprawdź kolizje
5. Włącz/wyłącz kosz - sprawdź reaktywność
6. Sprawdź listę komponentów dla różnych konfiguracji
7. Porównaj wyniki z obecnym konfiguratorem

### Przypadki testowe
- Drabina fasadowa 5m bez kosza → X modułów X7
- Drabina fasadowa 10m z koszem od 3m → Y segmentów kosza
- Drabina z podestem → brak "łączników poręczy"
- Edycja istniejącej drabiny → wszystkie wartości się zachowują

## Dodatkowe uwagi

### Kompatybilność wsteczna
- API backend pozostaje bez zmian
- Możliwość równoległego działania obu wersji podczas migracji

### Przyszłe rozszerzenia (nie w tym planie)
- Tryb B2B/B2C (osobny plan, obecnie porzucony)
- Tryb atyki (osobny plan, obecnie porzucony)
- Testy jednostkowe (Vitest)
- E2E testy (Cypress/Playwright)
