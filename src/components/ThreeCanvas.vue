<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

// ============================================
// PROPS - Configuration from parent component
// ============================================
const props = defineProps<{
  numX7Ladders: number
  finalLadderRungs: number | string  // Can be 0-7 or '7alt'
  safetyCageCount: number
  wallHeight: number  // in meters
  scheme: string  // 'none', 'safety', 'platform', 'attic'
  wspornikDistance: number  // in mm
  showWall: boolean
  showGround: boolean
  showInsulation: boolean
  suspended: boolean
  suspendedHeight: number  // in meters
  obstacles: Array<{ id: number; bottomHeightMm: number; heightMm: number; topHeightMm: number; type?: string }>
  // Optional advanced props
  cageClosing?: boolean
  restingPlatform?: boolean
  hasHandrails?: boolean  // Czy renderować poręcze (+1.1m)
  distanceFromGround?: number  // in mm, default 160
  showWsporniki?: boolean  // Show/hide wspornik models (default true)
  // Rodzina wspornikow: 'standard' = krotki/sredni/dlugi (para na kazdej
  // pozycji), 'typ_c' = wsporniki typu C (jeden element na pozycje). Wariant
  // rozmiarowy w obu przypadkach wynika z wspornikDistance.
  wspornikRodzina?: 'standard' | 'typ_c'
  eave?: { height: number; depth: number } | null  // Eave/overhang at top of wall
  atticPlatformDistance?: number  // Dystans podest-attyka w mm (dla attyki)
  atticWallHeight?: number  // Wysokość ściany strona zejścia w mm (dla attyki)
  descentMountType?: string  // Typ montażu strona zejścia: bigfoot, custom-base, brackets, self
  hiddenDistanceMm?: number  // Ukryty dystans gdy checkbox odznaczony
  customBaseHeight?: number  // Wysokość własnego podłoża w mm
  descentLadder?: {
    type: string
    rungs: number
    repeatLadder7: number
    endLadderRungs: number
    totalRungs?: number
    firstRungHeight?: number
    lastRungHeight?: number
    platformDistanceMm?: number
  } | null
  atticWallThickness?: number  // Grubość ściany attyki w mm
  atticHasInsulation?: boolean  // Czy jest ocieplenie na attyce (strona wejścia)
  atticInsulationThickness?: number  // Grubość ocieplenia attyki w mm (strona wejścia)
  atticBackHasInsulation?: boolean  // Czy jest ocieplenie strona zejścia
  atticBackInsulationThickness?: number  // Grubość ocieplenia strona zejścia w mm
  // Ocieplenie przedniej ściany (klasyczna/z podestem)
  hasInsulation?: boolean  // Czy jest ocieplenie przedniej ściany
  insulationThickness?: number  // Grubość ocieplenia w mm
  // Ściana strony zejścia dla płaskiego/okapu
  showDescentWall?: boolean  // Pokaż ścianę zejścia (dla płaskiego dachu)
  // Początkowe pozycje ściskanych uchwytów (dla trybu podglądu)
  initialSciskaneHandles?: Array<{ offsetFromBottom: number; connType: string }>
  // Początkowe typy łączników (dla trybu podglądu)
  initialConnectorTypes?: string[]
  // Odległość wsporników dla drabiny zejścia (przełaz attykowy z wsporniki)
  descentWspornikDistance?: number  // w mm
}>()

// ============================================
// EMITS - Events to parent component
// ============================================
const emit = defineEmits<{
  (e: 'ready'): void
  (e: 'update', data: {
    totalRungs: number
    totalHeightMm: number
    safetyCageCount: number
    connectorTypes: string[]
    wspornikTypes: string[]
    sciskaneHandles?: Array<{ offsetFromBottom: number; connType: string }>
    lastRungToGround?: number
    lastHoopToGround?: number
    bomData?: BOMData
  }): void
  (e: 'stateChange', data: object): void
  (e: 'editConnector', data: {
    pairIndex: number
    ladderNum: number
    currentConnType: string
    currentWspornikType: string
    isMidRung: boolean
  }): void
  (e: 'measureResult', data: {
    distanceMm: number
    axisMode: string
  }): void
  (e: 'techDrawingChange', data: {
    enabled: boolean
    view: string
    totalHeightMm: number
  }): void
  (e: 'debugInfo', data: {
    cameraRotation: { x: number; y: number }
    cameraOffset: { x: number; y: number; z: number }
    cameraZ: number
    totalHeight1: number
    numModules: number
    connectorCount: number
    wspornikCount: number
  }): void
  (e: 'editSciskaneHandle', data: {
    offsetFromBottom: number
    ladderNum: number
    connType: string
    wspornikType: string
    wspornikDistance: number
    isMidRung?: boolean
    isJointConnector?: boolean
    pairIndex?: number
  }): void
  (e: 'collisionWarning', data: {
    expectedBrackets: number
    actualBrackets: number
    missingBrackets: number
    message: string
  }): void
  (e: 'debugObjectUpdated', data: {
    id: string
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale?: { x: number; y: number; z: number }
  }): void
  (e: 'deleteRequest', data: {
    objectName: string
    objectType: string
    elementId: string
    objectData: any
  }): void
}>()

// ============================================
// REFS
// ============================================
const containerRef = ref<HTMLDivElement | null>(null)

// ============================================
// CONSTANTS - Dimensions in mm
// ============================================
const SCALE = 0.01  // 1mm = 0.01 Three.js units

const DIMS = {
  rungWidth: 30,
  rungHeight: 30,
  rungLength: 500,
  railWidth: 50,
  railDepth: 30,
  firstRungFromTop: 130,
  rungSpacing: 275,
  handrailVertical: 1011,
  handrailHorizontal: 540,
  handrailWidth: 30,
  atticRailHeight: 1650,
  atticRungs: 2,
  connectorHeight: 100,
  connectorBackWidth: 56,
  connectorArmDepth: 30,
  connectorThickness: 3,
  railHeights: {
    1: 175,
    2: 450,
    3: 725,
    4: 1000,
    5: 1275,
    6: 1550,
    7: 1922,
    '7alt': 1825
  } as Record<number | string, number>
}

const RAIL_OFFSET = 265  // Distance from center to rail inner edge

const wspornikDefaultDistances: Record<string, number> = {
  'krotki': 215,
  'sredni': 315,
  'dlugi': 415,
  // Typ C - jeden model na pozycje, srodek zakresu z nazwy
  'typ_c_16_26': 210,
  'typ_c_26_36': 310,
  'typ_c_36_46': 410,
  'typ_c_50_60': 550,
  'typ_c_60_70': 650,
  'typ_c_70_80': 750
}

// ============================================
// WSPORNIKI TYPU C
// ============================================
// Rodzina rownolegla do krotki/sredni/dlugi. Dwie roznice, ktore trzeba miec
// z tylu glowy przy czytaniu reszty kodu:
//
//  1. To JEDEN model na pozycje, a nie para lewy+prawy. Realizujemy to tak,
//     ze createWspornik() dla strony 'right' zwraca null - wszystkie 14 miejsc
//     wywolania jest osloniete warunkiem "if (rightWspornik)", wiec same
//     przestaja cokolwiek dodawac. Jedyny model idzie na srodek drabiny
//     (extraXOffset = RAIL_OFFSET znosi -RAIL_OFFSET z miejsca wywolania).
//
//  2. Rozmiar wynika z odleglosci drabiny od sciany ("Odl. wspornikow"),
//     a zakresy sa dokladnie takie, jak w nazwach modeli.
//
// Modele przyszly z CAD-u jako OBJ w milimetrach, odsuniete od srodka ukladu
// (bbox zaczyna sie w okolicach x=1495 mm), dlatego przy ladowaniu centrujemy
// je na wlasnym bounding boksie - patrz loadWspornikiTypC().
// Pole "przesuniecie" to dosuniecie modelu w mm wzdluz osi patrzenia na sciane:
// wartosc DODATNIA idzie w przod (od sciany), UJEMNA w tyl (do sciany).
// Kazdy wariant ma swoja, bo modele roznia sie dlugoscia zasiegu i centrowanie
// na bounding boksie zostawia inna nadwyzke. Dla drabiny 2 znak jest odwracany
// w createWspornik(), tak samo jak przy pozostalych wspornikach.
const TYP_C_WARIANTY: { typ: string; plik: string; min: number; max: number; przesuniecie: number; etykieta: string }[] = [
  { typ: 'typ_c_16_26', plik: 'wspornik_typ_c_16-26.glb', min: 160, max: 260, przesuniecie:    4, etykieta: 'Typ C 16-26 cm' },
  { typ: 'typ_c_26_36', plik: 'wspornik_typ_c_26-36.glb', min: 260, max: 360, przesuniecie:  -45, etykieta: 'Typ C 26-36 cm' },
  { typ: 'typ_c_36_46', plik: 'wspornik_typ_c_36-46.glb', min: 360, max: 460, przesuniecie:  -95, etykieta: 'Typ C 36-46 cm' },
  // Dolna granica 460, a nie 500: miedzy 46 a 50 cm nie ma zadnego wariantu,
  // wiec wszystko powyzej 460 mm idzie juz na 50-60. Sama nazwa handlowa
  // ("50-60") zostaje bez zmian - przesuwa sie tylko granica trasowania.
  { typ: 'typ_c_50_60', plik: 'wspornik_typ_c_50-60.glb', min: 460, max: 600, przesuniecie: -166, etykieta: 'Typ C 50-60 cm' },
  { typ: 'typ_c_60_70', plik: 'wspornik_typ_c_60-70.glb', min: 600, max: 700, przesuniecie: -216, etykieta: 'Typ C 60-70 cm' },
  { typ: 'typ_c_70_80', plik: 'wspornik_typ_c_70-80.glb', min: 700, max: 800, przesuniecie: -266, etykieta: 'Typ C 70-80 cm' }
]

/** Dosuniecie w mm dla danego wariantu typu C (dodatnie = w przod). */
function typCPrzesuniecie(typ: string): number {
  const w = TYP_C_WARIANTY.find((x) => x.typ === typ)
  return w ? w.przesuniecie : 0
}

function isTypC(typ: string): boolean {
  return typeof typ === 'string' && typ.indexOf('typ_c_') === 0
}

/**
 * Wariant typu C pasujacy do zadanej odleglosci od sciany (mm).
 *
 * Zakresy nie pokrywaja calej skali: miedzy 460 a 500 mm jest dziura, bo po
 * wariancie 36-46 nastepny jest dopiero 50-60. Suwak chodzi od 160 do 800,
 * wiec trzeba tam trafic i cos wybrac - bierzemy wariant NAJBLIZSZY, czyli
 * ten, do ktorego zakresu jest najmniej brakujacych milimetrow.
 */
function typCDlaOdleglosci(distanceMm: number): string {
  let najlepszy = TYP_C_WARIANTY[0]
  let najmniejszaOdleglosc = Infinity

  for (const w of TYP_C_WARIANTY) {
    if (distanceMm >= w.min && distanceMm <= w.max) return w.typ
    const odchylka = distanceMm < w.min ? w.min - distanceMm : distanceMm - w.max
    if (odchylka < najmniejszaOdleglosc) {
      najmniejszaOdleglosc = odchylka
      najlepszy = w
    }
  }
  return najlepszy.typ
}

// Korekta polozenia wspornikow typu C w poprzek i w pionie (mm), wspolna dla
// wszystkich wariantow. Dosuniecie do sciany jest osobne dla kazdego rozmiaru
// i siedzi w TYP_C_WARIANTY.przesuniecie.
const TYP_C_KOREKTA = { x: 0, y: 0 }

// Dodatkowe obroty typu C wzgledem ustawienia wspornika krotkiego. Modele
// przyszly z CAD-u ulozone inaczej niz reszta, wiec dokladamy im cwierc obrotu
// w bok (os Y) i cwierc w osi X. Obie liczby dzialaja niezaleznie - zmiana
// znaku obraca w druga strone, wyzerowanie znosi dany obrot.
// Ustawienie modelu typu C sklada sie z dwoch krokow i tak tez jest zapisane,
// bo w tej postaci daje sie je poprawiac patrzac na scene:
//
//  1. rotacja bazowa (extraRot* w createWspornik) - jak przy wsporniku krotkim,
//     tyle ze z cwiercia obrotu w bok, bo modele przyszly z CAD-u inaczej ulozone,
//  2. korekta ponizej, wokol osi SWIATA, nazwana tak, jak sie ja oglada na
//     modelu traktowanym jak szescian: "gorna sciana do tylu", a potem
//     "przednia sciana w lewo".
//
// Zmiana znaku obraca dany krok w druga strone, wyzerowanie go znosi.
const TYP_C_GORA_DO_TYLU = -Math.PI * 0.5
const TYP_C_PRZOD_W_LEWO = -Math.PI * 0.5

// Geometry configuration for each ladder (1 = front, 2 = back for attic)
const ladderGeometryConfig: Record<number, {
  zOffset: number
  rotationZ: number
  connector: {
    left: { x: number; y: number; z: number }
    right: { x: number; y: number; z: number }
    zOffset: number
    uchwytZOffset: number
  }
  sciskane: {
    left: { x: number; y: number; z: number }
    right: { x: number; y: number; z: number }
    leftZOffset: number
    rightZOffset: number
  }
  wspornik: {
    left: { x: number; y: number; z: number }
    right: { x: number; y: number; z: number }
    zOffset: number
  }
}> = {
  1: {
    zOffset: -3,  // Korekta -3mm
    rotationZ: 0,
    connector: {
      left: { x: Math.PI * 0.5, y: Math.PI, z: 0 },
      right: { x: Math.PI * 0.5, y: 0, z: 0 },
      zOffset: 3,  // Korekta +3mm (do przodu)
      uchwytZOffset: 3  // Korekta +3mm (do przodu)
    },
    sciskane: {
      left: { x: Math.PI * 0.5, y: 0, z: Math.PI },
      right: { x: Math.PI * 0.5, y: Math.PI, z: Math.PI },
      leftZOffset: -42,  // -45 + 3mm korekta
      rightZOffset: -42  // -45 + 3mm korekta
    },
    wspornik: {
      left: { x: 0, y: 0, z: 0 },
      right: { x: 0, y: Math.PI, z: 0 },
      zOffset: -142  // -145 + 3mm korekta (do przodu)
    }
  },
  2: {
    zOffset: -1070 - 3,  // Korekta -3mm
    rotationZ: Math.PI,
    connector: {
      left: { x: Math.PI * 1.5, y: Math.PI, z: 0 },
      right: { x: Math.PI * 1.5, y: 0, z: 0 },
      zOffset: -3,  // Korekta -3mm (do tyłu)
      uchwytZOffset: 121  // 124 - 3mm korekta (do tyłu)
    },
    sciskane: {
      left: { x: Math.PI * 0.5, y: Math.PI, z: 0 },
      right: { x: Math.PI * 0.5, y: 0, z: 0 },
      leftZOffset: 41,  // 44 - 3mm korekta
      rightZOffset: 41  // 44 - 3mm korekta
    },
    wspornik: {
      left: { x: 0, y: Math.PI, z: 0 },
      right: { x: 0, y: 0, z: 0 },
      zOffset: 142  // 145 - 3mm korekta (do tyłu)
    }
  }
}

// ============================================
// THREE.JS STATE
// ============================================
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
let perspectiveCamera: THREE.PerspectiveCamera
let orthoCamera: THREE.OrthographicCamera
let renderer: THREE.WebGLRenderer
let pivotGroup: THREE.Group  // For rotation
let ladderContainer: THREE.Group  // Actual models
let loader: GLTFLoader
let textureLoader: THREE.TextureLoader
let isDisposed = false

// Technical drawing mode
let isTechDrawingMode = false
let techDrawingView: 'front' | 'side' | 'back' | 'top' = 'front'
let savedCameraState: {
  rotation: { x: number; y: number }
  offset: { x: number; y: number; z: number }
  ladderPos: { x: number; y: number; z: number }
} | null = null
let savedBackground: THREE.Color | null = null

// Debug mode
let debugMode = false
let debugObjects: THREE.Object3D[] = []
let measurementBoxes: THREE.Mesh[] = [] // Boxy mierzenia (opacity 0 gdy nie w debug mode, miarka zawsze ignoruje)

// Osobne kontrolki widoczności wymiarów (niezależne od debug mode)
let showMeasurementBoxes = false // Widoczność boxów mierzenia
let showDimensions = false // Widoczność linii wymiarowej, etykiety i dysków

// Debug editor state
interface DebugObject {
  id: string
  name: string
  type: 'model' | 'box' | 'existing'
  object: THREE.Object3D
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  color?: string
  dimensions?: { width: number; height: number; depth: number }
}
let debugEditorObjects: DebugObject[] = []
let debugObjectIdCounter = 0
let selectedDebugObject: DebugObject | null = null

// Transform controls (CAD-like gizmo)
let transformControls: TransformControls | null = null
let transformMode: 'translate' | 'rotate' | 'scale' = 'translate'
let transformControlsEnabled = false

// Undo/Redo history
interface HistoryAction {
  type: 'move' | 'delete' | 'add'
  objectId: string
  objectData?: {
    name: string
    type: 'model' | 'box' | 'existing'
    object: THREE.Object3D
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
    color?: string
    dimensions?: { width: number; height: number; depth: number }
  }
  previousPosition?: { x: number; y: number; z: number }
  previousRotation?: { x: number; y: number; z: number }
  newPosition?: { x: number; y: number; z: number }
  newRotation?: { x: number; y: number; z: number }
}
let undoStack: HistoryAction[] = []
let redoStack: HistoryAction[] = []
const MAX_HISTORY = 50
let isUndoingOrRedoing = false
let lastRecordedPosition: { x: number; y: number; z: number } | null = null
let lastRecordedRotation: { x: number; y: number; z: number } | null = null

// Align mode (Fusion-style snap/align)
let alignMode = false
let alignStep: 'select-face' | 'select-target' | 'done' = 'done'
let alignSelectedFace: { axis: 'x' | 'y' | 'z'; side: 'min' | 'max'; position: number } | null = null
let alignFaceHelper: THREE.Mesh | null = null  // Visual helper for selected face
let alignPreviewSphere: THREE.Mesh | null = null  // Snap point preview sphere
let alignCurrentSnapPoint: THREE.Vector3 | null = null  // Current snap point from preview (world coords)

// Extrude mode (Fusion-style push/pull)
let extrudeMode = false
let extrudeActive = false  // Is currently dragging to extrude
let extrudeFace: { axis: 'x' | 'y' | 'z'; side: 'min' | 'max' } | null = null
let extrudeStartPoint: THREE.Vector3 | null = null
let extrudeStartSize: { x: number; y: number; z: number } | null = null
let extrudeStartPos: { x: number; y: number; z: number } | null = null
let extrudeFaceHelper: THREE.Mesh | null = null
let extrudeAxisHelper: THREE.Line | null = null

// Model material with texture
let modelMaterial: THREE.MeshStandardMaterial
let galvanizedTexture: THREE.Texture | null = null

// Outline settings (matching original)
let outlineEnabled = true
let outlineUserEnabled = true  // User preference
const outlineColor = 0x000000  // Black for contrast
const outlineOpacity = 0.6     // Visible but not overwhelming
const outlineThreshold = 25    // Balance between details and clarity
let outlineDelayTimer: ReturnType<typeof setTimeout> | null = null

// ============================================
// CAMERA CONTROL STATE (custom, not OrbitControls)
// ============================================
let isDragging = false
let isPanning = false
let previousPosition = { x: 0, y: 0 }
let targetRotation = { x: 0.35, y: -0.785 }
let currentRotation = { x: 0.35, y: -0.785 }
let cameraOffset = { x: 0, y: 0, z: 0 }
let initialPinchDistance: number | null = null
let lastZoom = 80
let lastPanCenter = { x: 0, y: 0 }
let isAnimating = false // Flag for smooth rotation animation
let animationFrameId: number | null = null
let clickStartPosition = { x: 0, y: 0 }
let clickStartTime = 0
const CLICK_THRESHOLD = 5
const CLICK_TIME_THRESHOLD = 400

// Edit mode - controlled by debugMode
let editMode = false  // Enabled when debugMode is on
let raycaster: THREE.Raycaster | null = null
let mouse = new THREE.Vector2()

// Measurement mode
let measureMode = false
let measureAxisMode: '3d' | 'x' | 'y' | 'z' = '3d'
let measurePoint1: THREE.Vector3 | null = null
let measurePoint2: THREE.Vector3 | null = null
let measureSphere1: THREE.Mesh | null = null
let measureSphere2: THREE.Mesh | null = null
let measureLine: THREE.Line | null = null
let measurePreviewSphere: THREE.Mesh | null = null

// Delete mode (for seller mode)
let deleteMode = false
let deleteHighlightedObject: THREE.Object3D | null = null
let originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map()

// Hidden elements system - elementy "usunięte" przez sprzedawcę
// Przechowuje ID elementów (np. "cage_hoop_1_3", "connector_1_2_left")
// Przeżywa regenerację modelu - elementy są ukrywane po renderowaniu
let hiddenElements: Set<string> = new Set()

// ============================================
// STATE VARIABLES
// ============================================
// Ladder 1 state
let numX7Ladders1 = 0
let finalLadderRungs1: number | string = 0
let connectorTypes1: string[] = []
let wspornikTypes1: string[] = []
let wspornikDistances1: number[] = []
let sciskaneHandles1: Array<{
  offsetFromBottom: number
  connType: string
  wspornikType: string
  wspornikDistance: number
  // true = typ ustawiony recznie w oknie "Edytuj uchwyty". Taki uchwyt nie jest
  // juz sprowadzany do rodziny wspornikow drabiny - patrz typWspornikaUchwytu().
  wspornikTypeManual?: boolean
  autoAdded?: boolean
  isReplacement?: boolean
  replacesType?: 'joint' | 'midRungBracket' | 'sciskane'
  replacesJointIndex?: number
  originalJointOffset?: number
  originalMidRungOffset?: number
  originalOffsetFromBottom?: number
  wasRelocated?: boolean
  hiddenByCollision?: boolean
}> = []
let globalWspornikDistance1 = 215
let defaultWspornik1 = 'krotki'
let wspornikDisabled1 = false

// Ladder 2 state (for attic)
let numX7Ladders2 = 0
let finalLadderRungs2: number | string = 0
let connectorTypes2: string[] = []
let wspornikTypes2: string[] = []
let wspornikDistances2: number[] = []
let sciskaneHandles2: Array<{
  offsetFromBottom: number
  connType: string
  wspornikType: string
  wspornikDistance: number
  // true = typ ustawiony recznie w oknie "Edytuj uchwyty". Taki uchwyt nie jest
  // juz sprowadzany do rodziny wspornikow drabiny - patrz typWspornikaUchwytu().
  wspornikTypeManual?: boolean
  autoAdded?: boolean
  isReplacement?: boolean
  replacesType?: 'joint' | 'midRungBracket' | 'sciskane'
  replacesJointIndex?: number
  originalJointOffset?: number
  originalMidRungOffset?: number
  originalOffsetFromBottom?: number
  wasRelocated?: boolean
  hiddenByCollision?: boolean
}> = []
let globalWspornikDistance2 = 215
let defaultWspornik2 = 'krotki'
let wspornikDisabled2 = false
let descentLadderZPosition = 0  // Z position of descent ladder in brackets mode

// Safety cage state
let safetyCageCount1 = 0
let safetyCageCount2 = 0
let cageClosing1 = false
let cageClosing2 = false
let restingPlatform1 = false

// Mid-rung bracket state
let midRungBracket1 = true
let midRungBracket2 = true
let midRungBracketConnType1 = 'uchwyt'
let midRungBracketConnType2 = 'uchwyt'
let midRungBracketWspornikType1 = 'krotki'
let midRungBracketWspornikType2 = 'krotki'
let midRungBracketDistance1 = 215
let midRungBracketDistance2 = 215

// Other state
let handrailType = 'none'
let hasHandrailsLocal = true
let wallHeightConfig = 0
let wallWidthConfig = 3000  // in mm, default 3000
let showWall = true
let showGround = true
let showInsulation = false  // Show insulation layer (default OFF)
let suspendedHeight1 = 0

// Object references for interaction
let connectorObjects: THREE.Object3D[] = []
let wspornikObjects: THREE.Object3D[] = []
let obstacleObjects: THREE.Object3D[] = []

// Sciskane mode state
let sciskaneMode = false
let sciskanePreviewObjects: THREE.Object3D[] = []
let sciskanePlacedObjects: THREE.Object3D[] = []

// Obstacles from configurator
let obstaclesFromConfigurator: Array<{ id: number; bottomHeightMm: number; heightMm: number; topHeightMm: number; type?: string }> = []

// ============================================
// COLLISION DETECTION STATE
// ============================================
// Green collision boxes (wspornik positions)
let greenCollisionBoxes: THREE.Object3D[] = []
let savedGreenBoxPositions: Record<number, { y: number; z: number; type: string }> = {}
let savedGreenBoxPositions2: Record<number, { y: number; z: number; type: string }> = {}  // For ladder 2 (descent)

// Collision tracking
let obstacleCollisions: number[] = []  // pairIndex of connectors colliding with obstacles
let autoChangedToLacznik: number[] = []  // pairIndex auto-changed to lacznik

// Hidden/relocated sciskane handles due to collision
interface HiddenSciskaneHandle {
  offsetFromBottom: number
  wspornikType: string
  connType?: string
  wspornikDistance?: number
  hiddenByCollision?: boolean
  originalOffsetFromBottom?: number
  wasRelocated?: boolean
  isReplacement?: boolean
  replacesType?: 'joint' | 'midRungBracket' | 'sciskane'
  replacesJointIndex?: number
  originalJointOffset?: number
  originalMidRungOffset?: number
  autoAdded?: boolean
}
let hiddenSciskaneHandles1: HiddenSciskaneHandle[] = []
// let hiddenSciskaneHandles2: HiddenSciskaneHandle[] = []  // TODO: For future attic support
let relocatedSciskaneHandles1: Array<{ originalOffset: number; newOffset: number }> = []
// let relocatedSciskaneHandles2: Array<{ originalOffset: number; newOffset: number }> = []  // TODO: For future attic support

// Hidden midRungBracket due to collision
let hiddenMidRungBracket1 = false
// let hiddenMidRungBracket2 = false  // TODO: For future attic support

// Debug visualization
let showDebugBboxes = false

// Flag to prevent infinite loop during collision check
let isCheckingCollisions = false

// Helper function to get wspornik distance for a specific pair
// ============================================
// LOADED MODELS
// ============================================
const loadedModels: {
  powielana: THREE.Group | null
  koncowa: Record<number | string, THREE.Group | null>
  uchwyt: THREE.Group | null
  lacznik: THREE.Group | null
  porecz: THREE.Group | null
  uchwytPoreczy: THREE.Group | null
  attyka: THREE.Group | null
  krataWema: THREE.Group | null
  sciskany: THREE.Group | null
  obrecz: THREE.Group | null
  zamykanie: THREE.Group | null
  katownikX2: THREE.Group | null
  katownikX3: THREE.Group | null
  katownikX4: THREE.Group | null
  wspornikKrotki: THREE.Group | null
  wspornikSredniLewy: THREE.Group | null
  wspornikSredniPrawy: THREE.Group | null
  wspornikDlugiLewy: THREE.Group | null
  wspornikDlugiPrawy: THREE.Group | null
  wspornikTypC: Record<string, THREE.Group | null>
  podestKrotki: THREE.Group | null
  podestSpoczynkowy: THREE.Group | null
  bigfoot: THREE.Group | null
  prowadnicaBigfoot: THREE.Group | null
} = {
  powielana: null,
  koncowa: {},
  uchwyt: null,
  lacznik: null,
  porecz: null,
  uchwytPoreczy: null,
  attyka: null,
  krataWema: null,
  sciskany: null,
  obrecz: null,
  zamykanie: null,
  katownikX2: null,
  katownikX3: null,
  katownikX4: null,
  wspornikKrotki: null,
  wspornikSredniLewy: null,
  wspornikSredniPrawy: null,
  wspornikDlugiLewy: null,
  wspornikDlugiPrawy: null,
  wspornikTypC: {},
  podestKrotki: null,
  podestSpoczynkowy: null,
  bigfoot: null,
  prowadnicaBigfoot: null
}

let modelsLoaded = false

// ============================================
// LIFECYCLE
// ============================================
onMounted(() => {
  if (!containerRef.value) return
  initScene()
  loadTextures()
  loadModels()
  setupControls()
  requestRender() // Initial render (on-demand rendering system)
  // Additional render after short delay to ensure lighting is fully applied
  setTimeout(() => {
    requestRender()
  }, 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  isDisposed = true
  window.removeEventListener('resize', handleResize)

  // Cancel pending animation frame
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  if (renderer) {
    renderer.dispose()
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement)
    }
  }
})

// ============================================
// WATCHERS - Sync props to internal state
// ============================================
watch(() => [
  props.numX7Ladders,
  props.finalLadderRungs,
  props.safetyCageCount,
  props.wallHeight,
  props.scheme,
  props.wspornikDistance,
  // Bez tego przejscie na typ C nie przerysowywalo sceny, gdy odleglosc
  // wychodzila taka sama jak dotad: typ C 26-36 to 310 mm, czyli dokladnie
  // tyle, co wspornik sredni, a 36-46 to 410 mm, czyli tyle co dlugi.
  props.wspornikRodzina,
  props.showWall,
  props.showGround,
  props.showInsulation,
  props.suspended,
  props.suspendedHeight,
  props.cageClosing,
  props.restingPlatform,
  props.hasHandrails,
  props.distanceFromGround,
  props.showWsporniki,
  props.eave,
  props.descentLadder,
  props.descentMountType,
  // Insulation props
  props.hasInsulation,
  props.insulationThickness,
  props.atticHasInsulation,
  props.atticInsulationThickness,
  props.atticBackHasInsulation,
  props.atticBackInsulationThickness,
  props.atticWallThickness,
  // Descent ladder wspornik distance
  props.descentWspornikDistance
], () => {
  console.log('[ThreeCanvas] Watch triggered - props changed:', {
    wspornikDistance: props.wspornikDistance,
    descentWspornikDistance: props.descentWspornikDistance,
    hasInsulation: props.hasInsulation,
    insulationThickness: props.insulationThickness,
    atticHasInsulation: props.atticHasInsulation,
    atticInsulationThickness: props.atticInsulationThickness,
    scheme: props.scheme
  })
  syncPropsToState()
  if (modelsLoaded) {
    createLadder()
  }
}, { deep: true })

watch(() => props.obstacles, () => {
  obstaclesFromConfigurator = props.obstacles || []
  if (modelsLoaded) {
    createLadder()
  }
}, { deep: true })

// Auto-scale camera zoom based on wall height (55 for 3m, 80 for 5m)
watch(() => props.wallHeight, (newHeight) => {
  if (perspectiveCamera && newHeight > 0) {
    // Linear: 3m→55, 5m→80 (12.5 per meter)
    const scaledZoom = 17.5 + newHeight * 12.5
    // Clamp between 40 and 200
    const clampedZoom = Math.max(40, Math.min(200, scaledZoom))
    perspectiveCamera.position.z = clampedZoom
    lastZoom = clampedZoom
    requestRender() // Render after zoom change
  }
}, { immediate: true })

// ============================================
// SYNC PROPS TO INTERNAL STATE
// ============================================
// Map API scheme values to internal values
function mapSchemeToHandrailType(scheme: string): string {
  const mapping: Record<string, string> = {
    'no-platform': 'safety',
    'with-platform': 'platform',
    'attic-passage': 'attic',
    // Also support direct values
    'none': 'none',
    'safety': 'safety',
    'platform': 'platform',
    'attic': 'attic'
  }
  return mapping[scheme] || 'safety'
}

/**
 * Typ wspornika wynikajacy z samych propsow: rodzine wskazuje uzytkownik,
 * rozmiar bierze sie z odleglosci od sciany.
 *
 * Osobna funkcja, bo syncPropsToState() potrzebuje tej wartosci JUZ przy
 * wczytywaniu uchwytow sciskanych - czyli zanim ustawi defaultWspornik1.
 */
function typWspornikaZProps(): string {
  const odleglosc = props.wspornikDistance
  if (!(odleglosc > 0)) return defaultWspornik1
  return props.wspornikRodzina === 'typ_c'
    ? typCDlaOdleglosci(odleglosc)
    : getWspornikTypeFromDistance(odleglosc)
}

/**
 * Typ wspornika dla uchwytu sciskanego.
 *
 * Uchwyty powstaja w kilkunastu miejscach - auto-dodawane przy kolizjach,
 * dodawane recznie, przywracane z ukrytych, odtwarzane z zapisanej
 * konfiguracji - i nie kazde z nich wie, jaka rodzine wspornikow wybral
 * uzytkownik. Zamiast poprawiac to w kazdym z osobna, rozstrzygamy w jednym
 * miejscu: gdy drabina stoi na wspornikach typu C, uchwyt tez dostaje typ C
 * w rozmiarze pasujacym do swojej odleglosci od sciany.
 */
function typWspornikaUchwytu(
  handle: { wspornikType: string; wspornikDistance?: number; wspornikTypeManual?: boolean },
  ladderNum: number
): string {
  const typ = handle.wspornikType
  if (!typ || typ === 'none') return typ

  // Typ ustawiony recznie w oknie "Edytuj uchwyty" zostaje taki, jaki jest.
  if (handle.wspornikTypeManual) return typ

  const rodzinaTypC = isTypC(ladderNum === 1 ? defaultWspornik1 : defaultWspornik2)
  if (!rodzinaTypC || isTypC(typ)) return typ

  const odleglosc = handle.wspornikDistance
    || (ladderNum === 1 ? globalWspornikDistance1 : globalWspornikDistance2)
  return typCDlaOdleglosci(odleglosc)
}

function syncPropsToState() {
  // Initialize sciskaneHandles from props if provided (for view mode)
  if (props.initialSciskaneHandles && props.initialSciskaneHandles.length > 0 && sciskaneHandles1.length === 0) {
    for (const handle of props.initialSciskaneHandles) {
      sciskaneHandles1.push({
        offsetFromBottom: handle.offsetFromBottom,
        connType: handle.connType,
        // Bylo tu zahardkodowane 'krotki' / 215, przez co uchwyty ściskane
        // wczytane z zapisanej konfiguracji nie znaly ani typu C, ani zadnego
        // innego ustawienia niz krotki.
        wspornikType: typWspornikaZProps(),
        wspornikDistance: props.wspornikDistance > 0 ? props.wspornikDistance : 215,
        autoAdded: false  // Mark as manually added
      })
    }
  }

  // Initialize connectorTypes from props if provided (for view mode)
  if (props.initialConnectorTypes && props.initialConnectorTypes.length > 0 && connectorTypes1.length === 0) {
    connectorTypes1.length = 0
    for (const type of props.initialConnectorTypes) {
      connectorTypes1.push(type)
    }
  }

  numX7Ladders1 = props.numX7Ladders
  finalLadderRungs1 = props.finalLadderRungs
  safetyCageCount1 = props.safetyCageCount
  handrailType = mapSchemeToHandrailType(props.scheme)
  hasHandrailsLocal = props.hasHandrails !== false  // domyślnie true
  wallHeightConfig = props.wallHeight * 1000  // Convert meters to mm
  showWall = props.showWall
  showGround = props.showGround
  showInsulation = props.showInsulation
  suspendedHeight1 = props.suspended ? props.suspendedHeight * 1000 : 0  // Convert meters to mm
  cageClosing1 = props.cageClosing || false
  restingPlatform1 = props.restingPlatform || false
  obstaclesFromConfigurator = props.obstacles || []

  // Mid-rung bracket: dla wysokości <= 1.96m użyj ściskanych zamiast uchwytów
  if (wallHeightConfig > 0 && wallHeightConfig <= 1960) {
    midRungBracketConnType1 = 'sciskany'
  } else {
    midRungBracketConnType1 = 'uchwyt'
  }

  // Update wspornik settings
  // Always update distance for wall positioning (even when wsporniki hidden)
  console.log('[ThreeCanvas] syncPropsToState wspornikDistance:', props.wspornikDistance, 'current globalWspornikDistance1:', globalWspornikDistance1)
  if (props.wspornikDistance > 0) {
    globalWspornikDistance1 = props.wspornikDistance
    // Rodzine wybiera uzytkownik, rozmiar wynika z odleglosci od sciany.
    defaultWspornik1 = typWspornikaZProps()
    updateGlobalWspornikDistance(1, props.wspornikDistance)
    console.log('[ThreeCanvas] Updated globalWspornikDistance1 to:', globalWspornikDistance1)
  }

  if (props.showWsporniki !== false && props.wspornikDistance > 0) {
    wspornikDisabled1 = false
  } else {
    wspornikDisabled1 = true
    if (props.wspornikDistance <= 0) {
      defaultWspornik1 = 'none'
    }
  }

  // Update wspornik settings for ladder 2 (descent) if provided
  if (props.descentWspornikDistance && props.descentWspornikDistance > 0 && props.descentMountType === 'brackets') {
    console.log('[ThreeCanvas] syncPropsToState descentWspornikDistance:', props.descentWspornikDistance, 'current globalWspornikDistance2:', globalWspornikDistance2)
    globalWspornikDistance2 = props.descentWspornikDistance
    defaultWspornik2 = getWspornikTypeFromDistance(props.descentWspornikDistance)
    updateGlobalWspornikDistance(2, props.descentWspornikDistance)
    console.log('[ThreeCanvas] Updated globalWspornikDistance2 to:', globalWspornikDistance2)
  }

  // Remove sciskane handles that are outside the current ladder height
  removeOutOfBoundsSciskaneHandles(1)
  if (props.descentMountType === 'brackets' && props.descentLadder) {
    removeOutOfBoundsSciskaneHandles(2)
  }

  // Auto-add sciskane handle for final ladders x4-x7 (between last two rungs)
  autoAddSciskaneForKoncowa(finalLadderRungs1, 1)

  // Auto-add sciskane handle for descent ladder (ladder 2) in brackets mode
  if (props.descentMountType === 'brackets' && props.descentLadder) {
    const descentEndRungs = props.descentLadder.endLadderRungs || 0
    // If no end section (x4-x7), clear all sciskane handles for ladder 2
    if (descentEndRungs === 0 || (descentEndRungs !== 4 && descentEndRungs !== 5 && descentEndRungs !== 6 && descentEndRungs !== 7)) {
      sciskaneHandles2.length = 0  // Clear all handles - no place for them without end section
    } else {
      autoAddSciskaneForKoncowa(descentEndRungs, 2)
    }
  } else {
    // Clean up all sciskane handles when not in brackets mode
    sciskaneHandles2.length = 0
  }
}

// ============================================
// INITIALIZATION
// ============================================
function initScene() {
  const container = containerRef.value!

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  // Cameras
  const aspect = container.clientWidth / container.clientHeight
  perspectiveCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500)
  perspectiveCamera.position.set(0, 0, 80)

  // Orthographic camera for technical drawing mode
  const orthoSize = 30
  orthoCamera = new THREE.OrthographicCamera(
    -orthoSize * aspect, orthoSize * aspect,
    orthoSize, -orthoSize,
    0.1, 500
  )
  orthoCamera.position.set(0, 0, 50)
  orthoCamera.lookAt(0, 0, 0)

  // Use perspective camera by default
  camera = perspectiveCamera

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Critical for mobile touch support - prevent browser default touch handling
  renderer.domElement.style.touchAction = 'none'
  renderer.domElement.style.userSelect = 'none'
  renderer.domElement.style.webkitUserSelect = 'none'

  container.appendChild(renderer.domElement)

  // Pivot group for rotation (contains ladderContainer)
  pivotGroup = new THREE.Group()
  scene.add(pivotGroup)

  // Ladder container (actual models go here)
  ladderContainer = new THREE.Group()
  pivotGroup.add(ladderContainer)

  // Lighting - brighter scene with softer shadows
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85)
  scene.add(ambientLight)

  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight1.position.set(5, 15, 10)
  directionalLight1.castShadow = true
  directionalLight1.shadow.mapSize.width = 2048
  directionalLight1.shadow.mapSize.height = 2048
  directionalLight1.shadow.camera.near = 0.5
  directionalLight1.shadow.camera.far = 50
  directionalLight1.shadow.camera.left = -15
  directionalLight1.shadow.camera.right = 15
  directionalLight1.shadow.camera.top = 15
  directionalLight1.shadow.camera.bottom = -15
  scene.add(directionalLight1)

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5)
  directionalLight2.position.set(-5, 5, -10)
  scene.add(directionalLight2)

  // Loaders
  loader = new GLTFLoader()
  textureLoader = new THREE.TextureLoader()

  // Raycaster for click detection
  raycaster = new THREE.Raycaster()

  // Transform controls for debug editor (CAD-like gizmo)
  transformControls = new TransformControls(camera, renderer.domElement)
  transformControls.setSize(0.8)
  transformControls.setSpace('local')  // Axes relative to object/ladder container
  transformControls.enabled = false
  const transformHelper = transformControls.getHelper()
  transformHelper.visible = false
  scene.add(transformHelper)

  // Update debug object position when transform controls change
  transformControls.addEventListener('change', () => {
    if (selectedDebugObject && transformControls) {
      const obj = selectedDebugObject.object
      selectedDebugObject.position = {
        x: obj.position.x / SCALE,
        y: obj.position.y / SCALE,
        z: obj.position.z / SCALE
      }
      selectedDebugObject.rotation = {
        x: obj.rotation.x * 180 / Math.PI,
        y: obj.rotation.y * 180 / Math.PI,
        z: obj.rotation.z * 180 / Math.PI
      }
      // Emit update event
      emit('debugObjectUpdated', {
        id: selectedDebugObject.id,
        position: selectedDebugObject.position,
        rotation: selectedDebugObject.rotation
      })
    }
  })

  // Disable camera rotation while using transform controls + record history
  transformControls.addEventListener('dragging-changed', (event) => {
    const isDragging = (event as { value: boolean }).value
    transformControlsEnabled = isDragging

    if (selectedDebugObject) {
      if (isDragging) {
        // Start dragging - save current position for undo
        lastRecordedPosition = { ...selectedDebugObject.position }
        lastRecordedRotation = { ...selectedDebugObject.rotation }
      } else {
        // End dragging - record move action if position changed
        if (lastRecordedPosition && lastRecordedRotation) {
          recordMoveAction(
            selectedDebugObject.id,
            lastRecordedPosition,
            lastRecordedRotation,
            selectedDebugObject.position,
            selectedDebugObject.rotation
          )
        }
        lastRecordedPosition = null
        lastRecordedRotation = null
      }
    }
  })
}

// ============================================
// TEXTURE LOADING
// ============================================
function loadTextures() {
  const textureRepeat = 0.008

  // Load texture - returns immediately, Three.js handles async loading
  galvanizedTexture = textureLoader.load('./textures/ocynk.png')
  galvanizedTexture.wrapS = THREE.RepeatWrapping
  galvanizedTexture.wrapT = THREE.RepeatWrapping
  galvanizedTexture.repeat.set(textureRepeat, textureRepeat)

  // Create material with texture reference immediately
  // Three.js will update rendering when texture finishes loading
  modelMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(230/255, 235/255, 240/255),
    map: galvanizedTexture,
    metalness: 0.3,
    roughness: 0.6
  })
}

// ============================================
// CAMERA CONTROLS SETUP (custom, not OrbitControls)
// ============================================
function setupControls() {
  const dom = renderer.domElement

  function onPointerStart(x: number, y: number) {
    isDragging = true
    previousPosition = { x, y }
    clickStartPosition = { x, y }
    clickStartTime = Date.now()
    startAnimation() // Start render loop when dragging begins
  }

  function onPointerMove(x: number, y: number) {
    if (!isDragging || isTechDrawingMode || transformControlsEnabled) return

    const deltaX = x - previousPosition.x
    const deltaY = y - previousPosition.y

    targetRotation.y += deltaX * 0.005
    targetRotation.x += deltaY * 0.005

    previousPosition = { x, y }
    requestRender() // Request render on each movement
  }

  function onPointerEnd() {
    isDragging = false
    // Continue animation for smooth deceleration
    if (isAnimating) {
      scheduleFrame()
    }
  }

  function handlePotentialClick(x: number, y: number) {
    if (!raycaster) return

    // Check if this was a click (not drag)
    const clickDist = Math.sqrt(
      Math.pow(x - clickStartPosition.x, 2) +
      Math.pow(y - clickStartPosition.y, 2)
    )
    const clickDuration = Date.now() - clickStartTime

    if (clickDist > CLICK_THRESHOLD || clickDuration > CLICK_TIME_THRESHOLD) {
      return  // This was a drag, not a click
    }

    // Calculate normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)

    // Delete mode - click on element to request deletion
    if (deleteMode) {
      const intersects = raycaster.intersectObjects(ladderContainer.children, true)

      for (const intersect of intersects) {
        const obj = intersect.object
        if (!obj.visible) continue

        // Skip helper objects
        if (obj.userData.isMeasureObject) continue
        if (obj.userData.isOutline) continue
        if (obj.userData.isGreenCollisionBox) continue
        if (obj.userData.isCollisionZone) continue
        if (obj.userData.isWallIndicator) continue
        if (obj.userData.isGroundIndicator) continue
        if (obj.userData.isInsulation) continue

        // Find the parent group that represents a deletable element
        const deletableElement = findDeletableParent(obj)
        if (deletableElement && deletableElement.userData.elementId) {
          const elementInfo = getElementInfo(deletableElement)
          emit('deleteRequest', {
            objectName: elementInfo.name,
            objectType: elementInfo.type,
            elementId: deletableElement.userData.elementId,
            objectData: {
              object: deletableElement,
              userData: deletableElement.userData
            }
          })
          return
        }
      }
      return
    }

    // Measure mode - click on any object to add measurement point
    if (measureMode) {
      const intersects = raycaster.intersectObjects(ladderContainer.children, true)

      // Znajdź pierwszy ważny intersect
      for (const intersect of intersects) {
        const obj = intersect.object
        if (obj.userData.isMeasureObject) continue
        if (!obj.visible) continue

        // Pomiń boxy mierzenia tylko gdy debug mode OFF
        if (!showMeasurementBoxes && obj.userData.isMeasurementBox) continue

        // Pomiń obiekty z opacity 0
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material
          if (!Array.isArray(mat) && (mat as THREE.MeshBasicMaterial).opacity === 0) continue
        }

        // Sprawdź flagi debug w hierarchii
        let isDebug = false
        let checkObj: THREE.Object3D | null = obj
        while (checkObj) {
          if (checkObj.userData.isGreenCollisionBox ||
              checkObj.userData.isCollisionZone ||
              checkObj.userData.isMidRungBox ||
              checkObj.userData.isSciskaneBox ||
              (!showMeasurementBoxes && checkObj.userData.isMeasurementBox) ||
              greenCollisionBoxes.includes(checkObj)) {
            isDebug = true
            break
          }
          checkObj = checkObj.parent
        }
        if (isDebug) continue

        // Spróbuj snap
        const snapPoint = findSnapPoint(intersect.point, intersect.object)
        addMeasurePoint(snapPoint || intersect.point)
        return
      }
      return
    }

    // Align mode - two step process
    if (alignMode && selectedDebugObject) {
      const intersects = raycaster.intersectObjects(ladderContainer.children, true)

      for (const intersect of intersects) {
        const obj = intersect.object
        if (obj.userData.isMeasureObject) continue
        if (obj.userData.isOutline) continue
        if (!obj.visible) continue
        if (obj === alignFaceHelper) continue  // Skip the helper plane

        // Check if clicking on selected object (for face selection)
        let isSelectedObj = false
        let checkObj: THREE.Object3D | null = obj
        while (checkObj) {
          if (checkObj === selectedDebugObject.object) {
            isSelectedObj = true
            break
          }
          checkObj = checkObj.parent
        }

        if (alignStep === 'select-face') {
          // Step 1: Select face on the object
          if (isSelectedObj) {
            handleAlignFaceSelection(intersect.point, intersect.face?.normal || null, intersect.object)
            return
          }
        } else if (alignStep === 'select-target') {
          // Step 2: Select target point (skip selected object)
          if (isSelectedObj) continue

          // Use the stored snap point from preview (more accurate than recalculating)
          // This ensures the alignment uses exactly the point shown by the preview sphere
          if (alignCurrentSnapPoint) {
            performAlignment(alignCurrentSnapPoint)
          } else {
            // Fallback: calculate snap point if not available
            const snapPoint = findSnapPoint(intersect.point, intersect.object)
            performAlignment(snapPoint || intersect.point)
          }
          alignCurrentSnapPoint = null
          return
        }
      }
      return
    }

    // Extrude mode - click to start extruding a face
    if (extrudeMode && selectedDebugObject && !extrudeActive) {
      const intersects = raycaster.intersectObjects(ladderContainer.children, true)

      for (const intersect of intersects) {
        const obj = intersect.object
        if (obj.userData.isMeasureObject) continue
        if (obj.userData.isOutline) continue
        if (!obj.visible) continue
        if (obj === extrudeFaceHelper || obj === extrudeAxisHelper) continue

        if (handleExtrudeMouseDown(event as MouseEvent, intersect)) {
          return
        }
      }
      return
    }

    // Sciskane mode - compare distances to find closest clickable object
    if (sciskaneMode) {
      // Collect all potential hits with their distances
      type ClickCandidate = {
        type: 'preview' | 'placed' | 'connector' | 'wspornik'
        distance: number
        obj: THREE.Object3D
        intersect: THREE.Intersection
      }
      const candidates: ClickCandidate[] = []

      // Check sciskane preview objects (green models)
      const previewIntersects = raycaster.intersectObjects(sciskanePreviewObjects, true)
      for (const intersect of previewIntersects) {
        let obj = intersect.object as THREE.Object3D
        while (obj.parent && !obj.userData.isSciskanePreview) {
          obj = obj.parent
        }
        if (obj.userData.isSciskanePreview) {
          candidates.push({ type: 'preview', distance: intersect.distance, obj, intersect })
          break
        }
      }

      // Check placed sciskane handles
      if (sciskanePlacedObjects.length > 0) {
        const placedIntersects = raycaster.intersectObjects(sciskanePlacedObjects, true)
        for (const intersect of placedIntersects) {
          let obj = intersect.object as THREE.Object3D
          while (obj.parent && !obj.userData.isSciskanePlaced) {
            obj = obj.parent
          }
          if (obj.userData.isSciskanePlaced) {
            candidates.push({ type: 'placed', distance: intersect.distance, obj, intersect })
            break
          }
        }
      }

      // Check connectors
      const connIntersects = raycaster.intersectObjects(connectorObjects, true)
      for (const intersect of connIntersects) {
        let obj = intersect.object as THREE.Object3D
        while (obj.parent && connectorObjects.indexOf(obj) === -1) {
          obj = obj.parent
        }
        if (obj.userData.isConnector) {
          candidates.push({ type: 'connector', distance: intersect.distance, obj, intersect })
          break
        }
      }

      // Check wsporniki
      const wspIntersects = raycaster.intersectObjects(wspornikObjects, true)
      for (const intersect of wspIntersects) {
        let obj = intersect.object as THREE.Object3D
        while (obj.parent && wspornikObjects.indexOf(obj) === -1) {
          obj = obj.parent
        }
        if (obj.userData.isWspornik) {
          candidates.push({ type: 'wspornik', distance: intersect.distance, obj, intersect })
          break
        }
      }

      // Sort by distance and handle the closest one
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.distance - b.distance)
        const closest = candidates[0]

        if (closest.type === 'preview') {
          addSciskaneHandle(closest.obj.userData.previewY, closest.obj.userData.ladderNum || 1)
          return
        }

        if (closest.type === 'placed') {
          const offsetFromBottom = closest.obj.userData.offsetFromBottom
          const ladderNum = closest.obj.userData.ladderNum || 1
          const handles = ladderNum === 1 ? sciskaneHandles1 : sciskaneHandles2
          const handle = handles.find(h => h.offsetFromBottom === offsetFromBottom)
          if (handle) {
            emit('editSciskaneHandle', {
              offsetFromBottom,
              ladderNum,
              connType: handle.connType || 'sciskany',
              wspornikType: handle.wspornikType || 'krotki',
              wspornikDistance: handle.wspornikDistance || 215
            })
          }
          return
        }

        if (closest.type === 'connector') {
          const obj = closest.obj
          const ladderNum = obj.userData.ladderNum || 1
          const isMidRung = obj.userData.isMidRungBracket || false
          const pairIndex = obj.userData.pairIndex

          if (isMidRung) {
            const connType = (ladderNum === 1) ? midRungBracketConnType1 : midRungBracketConnType2
            const wspornikType = (ladderNum === 1) ? midRungBracketWspornikType1 : midRungBracketWspornikType2
            const wspornikDistance = (ladderNum === 1) ? midRungBracketDistance1 : midRungBracketDistance2
            emit('editSciskaneHandle', {
              offsetFromBottom: -1,
              ladderNum,
              connType,
              wspornikType,
              wspornikDistance,
              isMidRung: true
            } as any)
          } else {
            const connectorTypes = ladderNum === 1 ? connectorTypes1 : connectorTypes2
            const wspornikTypes = ladderNum === 1 ? wspornikTypes1 : wspornikTypes2
            const wspornikDistances = ladderNum === 1 ? wspornikDistances1 : wspornikDistances2

            const connType = (pairIndex !== undefined && pairIndex < connectorTypes.length)
              ? connectorTypes[pairIndex]
              : 'uchwyt'
            const wspornikType = (pairIndex !== undefined && pairIndex < wspornikTypes.length)
              ? wspornikTypes[pairIndex]
              : (ladderNum === 1 ? defaultWspornik1 : defaultWspornik2)
            const wspornikDistance = (pairIndex !== undefined && pairIndex < wspornikDistances.length)
              ? wspornikDistances[pairIndex]
              : (ladderNum === 1 ? globalWspornikDistance1 : globalWspornikDistance2)

            emit('editSciskaneHandle', {
              offsetFromBottom: -1,
              ladderNum,
              connType,
              wspornikType,
              wspornikDistance,
              isMidRung: false,
              isJointConnector: true,
              pairIndex
            })
          }
          return
        }

        if (closest.type === 'wspornik') {
          const obj = closest.obj
          const pairIndex = obj.userData.pairIndex
          const ladderNum = obj.userData.ladderNum || 1
          const isMidRung = obj.userData.isMidRungBracket || false

          const connectorTypes = ladderNum === 1 ? connectorTypes1 : connectorTypes2
          const wspornikTypes = ladderNum === 1 ? wspornikTypes1 : wspornikTypes2
          const wspornikDistances = ladderNum === 1 ? wspornikDistances1 : wspornikDistances2

          const connType = (pairIndex !== undefined && pairIndex < connectorTypes.length)
            ? connectorTypes[pairIndex]
            : 'uchwyt'
          const wspornikType = (pairIndex !== undefined && pairIndex < wspornikTypes.length)
            ? wspornikTypes[pairIndex]
            : (ladderNum === 1 ? defaultWspornik1 : defaultWspornik2)
          const wspornikDistance = (pairIndex !== undefined && pairIndex < wspornikDistances.length)
            ? wspornikDistances[pairIndex]
            : (ladderNum === 1 ? globalWspornikDistance1 : globalWspornikDistance2)

          emit('editSciskaneHandle', {
            offsetFromBottom: -1,
            ladderNum,
            connType,
            wspornikType,
            wspornikDistance,
            isMidRung,
            isJointConnector: !isMidRung,
            pairIndex
          })
          return
        }
      }

      return
    }

    // Edit mode - check for connector/wspornik clicks (only when not in sciskane mode)
    if (!editMode) return

    // Check for sciskane placed objects (auto-added and replacement handles) in edit mode
    if (sciskanePlacedObjects.length > 0) {
      const placedIntersects = raycaster.intersectObjects(sciskanePlacedObjects, true)
      for (const intersect of placedIntersects) {
        let obj = intersect.object as THREE.Object3D
        while (obj.parent && !obj.userData.isSciskanePlaced) {
          obj = obj.parent
        }
        if (obj.userData.isSciskanePlaced) {
          const offsetFromBottom = obj.userData.offsetFromBottom
          const ladderNum = obj.userData.ladderNum || 1
          const handles = ladderNum === 1 ? sciskaneHandles1 : sciskaneHandles2
          const handle = handles.find(h => h.offsetFromBottom === offsetFromBottom)
          if (handle) {
            emit('editSciskaneHandle', {
              offsetFromBottom,
              ladderNum,
              connType: handle.connType || 'sciskany',
              wspornikType: handle.wspornikType || 'krotki',
              wspornikDistance: handle.wspornikDistance || 215
            })
          }
          return
        }
      }
    }

    // Check for wspornik clicks first
    const wspornikIntersects = raycaster.intersectObjects(wspornikObjects, true)
    if (wspornikIntersects.length > 0) {
      let obj = wspornikIntersects[0].object as THREE.Object3D
      // Find root model that is in wspornikObjects array (has pairIndex set)
      while (obj.parent && wspornikObjects.indexOf(obj) === -1) {
        obj = obj.parent
      }
      if (obj.userData.isWspornik) {
        const pairIndex = obj.userData.pairIndex
        const ladderNum = obj.userData.ladderNum || 1
        const isMidRung = obj.userData.isMidRungBracket || false

        // Get data from arrays
        const connectorTypes = ladderNum === 1 ? connectorTypes1 : connectorTypes2
        const wspornikTypes = ladderNum === 1 ? wspornikTypes1 : wspornikTypes2
        const wspornikDistances = ladderNum === 1 ? wspornikDistances1 : wspornikDistances2

        const connType = (pairIndex !== undefined && pairIndex < connectorTypes.length)
          ? connectorTypes[pairIndex]
          : 'uchwyt'
        const wspornikType = (pairIndex !== undefined && pairIndex < wspornikTypes.length)
          ? wspornikTypes[pairIndex]
          : (ladderNum === 1 ? defaultWspornik1 : defaultWspornik2)
        const wspornikDistance = (pairIndex !== undefined && pairIndex < wspornikDistances.length)
          ? wspornikDistances[pairIndex]
          : (ladderNum === 1 ? globalWspornikDistance1 : globalWspornikDistance2)

        emit('editSciskaneHandle', {
          offsetFromBottom: -1,  // Special marker for joint connector
          ladderNum,
          connType,
          wspornikType,
          wspornikDistance,
          isMidRung,
          isJointConnector: !isMidRung,  // Only joint connector if not midRung
          pairIndex
        })
        return
      }
    }

    // Check for connector clicks
    const connIntersects = raycaster.intersectObjects(connectorObjects, true)
    if (connIntersects.length > 0) {
      let obj = connIntersects[0].object as THREE.Object3D
      // Find root model that is in connectorObjects array (has pairIndex set)
      while (obj.parent && connectorObjects.indexOf(obj) === -1) {
        obj = obj.parent
      }
      if (obj.userData.isConnector) {
        const pairIndex = obj.userData.pairIndex
        const ladderNum = obj.userData.ladderNum || 1
        const connType = obj.userData.connectorType || 'uchwyt'
        const isMidRung = obj.userData.isMidRungBracket || false

        // Get wspornikType and distance from arrays (not userData)
        const wspornikTypes = ladderNum === 1 ? wspornikTypes1 : wspornikTypes2
        const wspornikDistances = ladderNum === 1 ? wspornikDistances1 : wspornikDistances2
        const wspornikType = (pairIndex !== undefined && pairIndex < wspornikTypes.length)
          ? wspornikTypes[pairIndex]
          : (ladderNum === 1 ? defaultWspornik1 : defaultWspornik2)
        const wspornikDistance = (pairIndex !== undefined && pairIndex < wspornikDistances.length)
          ? wspornikDistances[pairIndex]
          : (ladderNum === 1 ? globalWspornikDistance1 : globalWspornikDistance2)

        emit('editSciskaneHandle', {
          offsetFromBottom: -1,  // Special marker for joint connector
          ladderNum,
          connType,
          wspornikType,
          wspornikDistance,
          isMidRung,
          isJointConnector: !isMidRung,  // Only joint connector if not midRung
          pairIndex
        })
        return
      }
    }
  }

  // Mouse events
  dom.addEventListener('mousedown', (e) => {
    if (e.shiftKey || e.button === 1 || (isTechDrawingMode && e.button === 0)) {
      // Shift or middle button = pan, also left click in tech drawing mode
      isPanning = true
      previousPosition = { x: e.clientX, y: e.clientY }
      e.preventDefault()
      startAnimation() // Start render loop for panning
    } else {
      onPointerStart(e.clientX, e.clientY)
    }
  })

  dom.addEventListener('mousemove', (e) => {
    // Handle panning in tech drawing mode (ortho camera)
    if (isTechDrawingMode) {
      if (isPanning) {
        const deltaX = e.clientX - previousPosition.x
        const deltaY = e.clientY - previousPosition.y

        // Pan ortho camera - adjust position based on current zoom level
        const panScale = (orthoCamera.right - orthoCamera.left) / containerRef.value!.clientWidth

        // W widoku side: lewo/prawo przesuwa Z, góra/dół przesuwa Y
        if (techDrawingView === 'side') {
          orthoCamera.position.z += deltaX * panScale
          orthoCamera.position.y += deltaY * panScale
        } else {
          orthoCamera.position.x -= deltaX * panScale
          orthoCamera.position.y += deltaY * panScale
        }

        previousPosition = { x: e.clientX, y: e.clientY }
        requestRender() // Render during pan
      }
      return
    }

    // Update measure preview when in measure mode
    if (measureMode && !isPanning && !isDragging) {
      updateMeasurePreview(e.clientX, e.clientY)
    }

    // Update align preview when in align mode (step 2 - select target)
    if (alignMode && alignStep === 'select-target' && !isPanning && !isDragging) {
      updateAlignPreview(e.clientX, e.clientY)
    }

    // Handle extrude dragging
    if (extrudeActive && !isPanning) {
      handleExtrudeMouseMove(e)
      return
    }

    if (isPanning) {
      const deltaX = e.clientX - previousPosition.x
      const deltaY = e.clientY - previousPosition.y

      const panScale = camera.position.z * 0.00075
      cameraOffset.x -= deltaX * panScale
      cameraOffset.y += deltaY * panScale

      previousPosition = { x: e.clientX, y: e.clientY }
      startAnimation() // Render during pan
    } else {
      onPointerMove(e.clientX, e.clientY)
    }
  })

  dom.addEventListener('mouseup', (e) => {
    // Handle extrude finish
    if (extrudeActive) {
      handleExtrudeMouseUp()
      return
    }

    if (!isPanning) {
      handlePotentialClick(e.clientX, e.clientY)
    }
    isPanning = false
    onPointerEnd()
  })

  dom.addEventListener('mouseleave', () => {
    const wasInteracting = isPanning || isDragging
    isPanning = false
    onPointerEnd()
    // Continue animation for smooth deceleration
    if (wasInteracting && isAnimating) {
      scheduleFrame()
    }
  })

  // Wheel zoom
  dom.addEventListener('wheel', (e) => {
    e.preventDefault()

    if (isTechDrawingMode) {
      // Zoom ortho camera by adjusting the ortho size
      const zoomFactor = 1 + e.deltaY * 0.001
      const currentSize = orthoCamera.top

      // Clamp zoom between 1 and 150 (większy limit dla oddalenia)
      const newSize = Math.max(1, Math.min(300, currentSize * zoomFactor))

      const container = containerRef.value!
      const aspect = container.clientWidth / container.clientHeight

      orthoCamera.left = -newSize * aspect
      orthoCamera.right = newSize * aspect
      orthoCamera.top = newSize
      orthoCamera.bottom = -newSize
      orthoCamera.updateProjectionMatrix()
      requestRender() // Render after zoom
      return
    }

    perspectiveCamera.position.z *= (1 + e.deltaY * 0.001)
    perspectiveCamera.position.z = Math.max(3, Math.min(300, perspectiveCamera.position.z))
    requestRender() // Render after zoom
  }, { passive: false })

  // Touch events
  let lastOrthoZoom = 20 // Dla pinch-to-zoom w trybie technicznym

  dom.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault()
      // W trybie technicznym: jeden palec = panning
      if (isTechDrawingMode) {
        isPanning = true
        previousPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        startAnimation()
      } else {
        onPointerStart(e.touches[0].clientX, e.touches[0].clientY)
      }
    } else if (e.touches.length === 2) {
      e.preventDefault()
      isDragging = false
      isPanning = false

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      lastPanCenter = { x: centerX, y: centerY }

      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy)
      lastZoom = camera.position.z
      lastOrthoZoom = orthoCamera.top
    }
  }, { passive: false })

  dom.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault()
      // W trybie technicznym: jeden palec = panning
      if (isTechDrawingMode && isPanning) {
        const deltaX = e.touches[0].clientX - previousPosition.x
        const deltaY = e.touches[0].clientY - previousPosition.y

        const panScale = (orthoCamera.right - orthoCamera.left) / containerRef.value!.clientWidth

        if (techDrawingView === 'side') {
          orthoCamera.position.z += deltaX * panScale
          orthoCamera.position.y += deltaY * panScale
        } else {
          orthoCamera.position.x -= deltaX * panScale
          orthoCamera.position.y += deltaY * panScale
        }

        previousPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        requestRender()
      } else if (!isTechDrawingMode) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    } else if (e.touches.length === 2) {
      e.preventDefault()

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2

      const panDeltaX = centerX - lastPanCenter.x
      const panDeltaY = centerY - lastPanCenter.y

      // Pinch-to-zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (isTechDrawingMode) {
        // Tech drawing mode: pan i zoom ortho camera
        const panScale = (orthoCamera.right - orthoCamera.left) / containerRef.value!.clientWidth

        if (techDrawingView === 'side') {
          orthoCamera.position.z += panDeltaX * panScale
          orthoCamera.position.y += panDeltaY * panScale
        } else {
          orthoCamera.position.x -= panDeltaX * panScale
          orthoCamera.position.y += panDeltaY * panScale
        }

        // Pinch zoom dla ortho
        if (initialPinchDistance) {
          const scale = initialPinchDistance / distance
          const newSize = Math.max(1, Math.min(300, lastOrthoZoom * scale))

          const container = containerRef.value!
          const aspect = container.clientWidth / container.clientHeight

          orthoCamera.left = -newSize * aspect
          orthoCamera.right = newSize * aspect
          orthoCamera.top = newSize
          orthoCamera.bottom = -newSize
          orthoCamera.updateProjectionMatrix()
        }

        requestRender()
      } else {
        // Normal mode: pan i zoom perspective camera
        const touchPanScale = camera.position.z * 0.0015
        cameraOffset.x -= panDeltaX * touchPanScale
        cameraOffset.y += panDeltaY * touchPanScale

        if (initialPinchDistance) {
          const delta = initialPinchDistance - distance
          camera.position.z = lastZoom * (1 + delta * 0.005)
          camera.position.z = Math.max(3, Math.min(300, camera.position.z))
        }

        startAnimation()
      }

      lastPanCenter = { x: centerX, y: centerY }
    }
  }, { passive: false })

  dom.addEventListener('touchend', (e) => {
    e.preventDefault()
    isPanning = false
    onPointerEnd()
    if (e.touches.length < 2) {
      initialPinchDistance = null
    }
  }, { passive: false })

  // Prevent middle button scroll
  dom.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault()
  })
}

// ============================================
// MODEL LOADING
// ============================================
function loadModels() {
  // Licznik musi zgadzac sie z liczba faktycznie ladowanych plikow: warunek
  // nizej jest ">=", wiec zanizona wartosc powoduje, ze createLadder() odpala
  // sie ponownie przy KAZDYM kolejnym zaladowanym modelu.
  const modelsToLoad = 27 + TYP_C_WARIANTY.length
  let modelsLoadedCount = 0

  function onModelLoaded() {
    modelsLoadedCount++
    if (modelsLoadedCount >= modelsToLoad) {
      modelsLoaded = true
      syncPropsToState()
      createLadder()
      emit('ready')
      // Extra render to ensure lighting is applied
      setTimeout(() => requestRender(), 50)
    }
  }

  function applyMaterial(gltfScene: THREE.Group): THREE.Group {
    const obj = gltfScene.clone()

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    // Create container and center the model
    const container = new THREE.Group()
    obj.position.set(-center.x, -center.y, -center.z)
    container.add(obj)

    // Apply material and shadows
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = modelMaterial.clone()
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    // Store original dimensions
    container.userData.originalHeight = size.y
    container.userData.originalWidth = size.x
    container.userData.originalDepth = size.z

    return container
  }

  function loadModel(filename: string, onSuccess: (model: THREE.Group) => void) {
    loader.load(
      `./models/${filename}`,
      (gltf) => {
        onSuccess(applyMaterial(gltf.scene))
        onModelLoaded()
      },
      undefined,
      (error) => {
        console.warn(`Failed to load ${filename}:`, error)
        onModelLoaded()
      }
    )
  }

  // Load all models
  loadModel('drabinapowielana.glb', (m) => { loadedModels.powielana = m })

  for (let i = 1; i <= 7; i++) {
    loadModel(`koncowa-x${i}.glb`, (m) => { loadedModels.koncowa[i] = m })
  }

  loadModel('bryla400.glb', (m) => { loadedModels.uchwyt = m })
  loadModel('lacznik.glb', (m) => { loadedModels.lacznik = m })
  loadModel('porecz.glb', (m) => { loadedModels.porecz = m })
  loadModel('uchwyt poreczy.glb', (m) => { loadedModels.uchwytPoreczy = m })
  loadModel('przejscieprzezattyke.glb', (m) => { loadedModels.attyka = m })
  loadModel('krata wema.glb', (m) => { loadedModels.krataWema = m })
  loadModel('uchwyt sciskany.glb', (m) => { loadedModels.sciskany = m })
  loadModel('obrecz.glb', (m) => { loadedModels.obrecz = m })
  loadModel('zamykanie.glb', (m) => { loadedModels.zamykanie = m })
  loadModel('katownikx2.glb', (m) => { loadedModels.katownikX2 = m })
  loadModel('katownikx3.glb', (m) => { loadedModels.katownikX3 = m })
  loadModel('katownik_x4.glb', (m) => { loadedModels.katownikX4 = m })
  loadModel('wspornik_krotki.glb', (m) => { loadedModels.wspornikKrotki = m })
  loadModel('wspornik_sredni_lewy.glb', (m) => { loadedModels.wspornikSredniLewy = m })
  loadModel('wspornik_sredni_prawy.glb', (m) => { loadedModels.wspornikSredniPrawy = m })
  loadModel('wspornik_dlugi_lewy.glb', (m) => { loadedModels.wspornikDlugiLewy = m })
  loadModel('wspornik_dlugi_prawy.glb', (m) => { loadedModels.wspornikDlugiPrawy = m })
  loadWspornikiTypC(loadModel)
  loadModel('podest_krotki.glb', (m) => { loadedModels.podestKrotki = m })
  loadModel('podest_spoczynkowy.glb', (m) => { loadedModels.podestSpoczynkowy = m })
  loadModel('bigfoot.glb', (m) => { loadedModels.bigfoot = m })
  loadModel('prowadnica_bigfoot.glb', (m) => { loadedModels.prowadnicaBigfoot = m })
}

/**
 * Wsporniki typu C - szesc wariantow rozmiarowych.
 *
 * Modele pochodza prosto z CAD-u (OBJ -> GLB) i maja geometrie odsunieta od
 * srodka ukladu wspolrzednych: bounding box zaczyna sie w okolicach x = 1495 mm.
 * Gdyby wstawic je tak jak sa, wspornik wyladowalby poltora metra obok drabiny,
 * dlatego kazdy model centrujemy na wlasnym bounding boksie zaraz po zaladowaniu.
 * Dzieki temu punktem odniesienia jest srodek elementu i dalsze dosuwanie
 * sprowadza sie do trzech liczb w TYP_C_KOREKTA.
 */
function loadWspornikiTypC(loadModel: (filename: string, onSuccess: (model: THREE.Group) => void) => void) {
  for (const wariant of TYP_C_WARIANTY) {
    loadModel(wariant.plik, (m: THREE.Group) => {
      const srodek = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())
      m.position.sub(srodek)

      // Owijamy w grupe, zeby przesuniecie centrujace nie gubilo sie przy
      // clone() i przy pozniejszym ustawianiu position/rotation na kopii.
      const grupa = new THREE.Group()
      grupa.add(m)
      loadedModels.wspornikTypC[wariant.typ] = grupa
    })
  }
}

// ============================================
// OUTLINE HELPERS
// ============================================
function addOutlineToModel(model: THREE.Object3D) {
  if (!outlineEnabled) return

  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) {
      const mesh = child as THREE.Mesh
      const edges = new THREE.EdgesGeometry(mesh.geometry, outlineThreshold)
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: outlineColor,
        transparent: true,
        opacity: outlineOpacity
      }))
      line.userData.isOutline = true
      mesh.add(line)
    }
  })
}

function reapplyOutlines() {
  if (!outlineEnabled) return

  ladderContainer.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) {
      const mesh = child as THREE.Mesh
      // Check if already has outline
      let hasOutline = false
      mesh.children.forEach(c => {
        if (c.userData.isOutline) hasOutline = true
      })
      if (!hasOutline) {
        const edges = new THREE.EdgesGeometry(mesh.geometry, outlineThreshold)
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
          color: outlineColor,
          transparent: true,
          opacity: outlineOpacity
        }))
        line.userData.isOutline = true
        mesh.add(line)
      }
    }
  })
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function getLadderHeight(rungs: number | string): number {
  return DIMS.railHeights[rungs] || 0
}

// ============================================
// AUTO-SCISKANE FOR FINAL LADDERS X4-X7
// ============================================
/**
 * Calculate offset from bottom for the sciskane position
 * between the last and second-to-last rungs of a final ladder
 */
function getLastSciskaneOffsetForKoncowa(rungs: number | string): number {
  const koncowaHeight = DIMS.railHeights[rungs]
  const actualRungs = (rungs === '7alt') ? 7 : rungs as number
  // Position between last two rungs: height - firstRungFromTop - ((rungs-2) * rungSpacing) - rungSpacing/2
  return koncowaHeight - DIMS.firstRungFromTop - ((actualRungs - 2) * DIMS.rungSpacing) - DIMS.rungSpacing / 2
}

/**
 * Remove auto-added sciskane handles from the handles array
 */
function removeAutoAddedSciskane(ladderNum: number): void {
  const handles = (ladderNum === 1) ? sciskaneHandles1 : sciskaneHandles2
  const hiddenHandles = (ladderNum === 1) ? hiddenSciskaneHandles1 : []

  // Remove from main handles array
  for (let i = handles.length - 1; i >= 0; i--) {
    if (handles[i].autoAdded) {
      handles.splice(i, 1)
    }
  }

  // Remove from hidden handles array
  for (let j = hiddenHandles.length - 1; j >= 0; j--) {
    if (hiddenHandles[j].autoAdded) {
      hiddenHandles.splice(j, 1)
    }
  }
}

/**
 * Remove sciskane handles that are outside the current ladder height
 * Called when ladder configuration changes (e.g., wall height decreased)
 */
function removeOutOfBoundsSciskaneHandles(ladderNum: number): void {
  const handles = (ladderNum === 1) ? sciskaneHandles1 : sciskaneHandles2
  const hiddenHandles = (ladderNum === 1) ? hiddenSciskaneHandles1 : []
  const currentHeight = getTotalHeightForLadder(ladderNum)

  // Margin from top - handles must be at least 100mm below the top
  const maxOffset = currentHeight - 100

  // Remove from main handles array
  for (let i = handles.length - 1; i >= 0; i--) {
    const handle = handles[i]
    // Skip auto-added handles (they will be recalculated anyway)
    if (handle.autoAdded) continue

    const offset = handle.offsetFromBottom
    if (offset > maxOffset || offset < 100) {
      console.log(`[removeOutOfBoundsSciskane] Removing handle at offset ${offset} (max: ${maxOffset})`)
      handles.splice(i, 1)
    }
  }

  // Also remove from hidden handles array
  for (let j = hiddenHandles.length - 1; j >= 0; j--) {
    const handle = hiddenHandles[j]
    if (handle.autoAdded) continue

    const offset = handle.originalOffsetFromBottom || handle.offsetFromBottom
    if (offset > maxOffset || offset < 100) {
      hiddenHandles.splice(j, 1)
    }
  }
}

/**
 * Automatically add a sciskane handle for final ladders x4, x5, x6, x7, x7alt
 * between the last and second-to-last rungs
 */
function autoAddSciskaneForKoncowa(rungs: number | string, ladderNum: number): void {
  // First remove previous auto-added handles
  removeAutoAddedSciskane(ladderNum)

  // Only for x4, x5, x6, x7, x7alt
  if (rungs !== 4 && rungs !== 5 && rungs !== 6 && rungs !== 7 && rungs !== '7alt') {
    return
  }

  const handles = (ladderNum === 1) ? sciskaneHandles1 : sciskaneHandles2
  const offset = getLastSciskaneOffsetForKoncowa(rungs)

  // Check if user already added a handle at this position
  for (let i = 0; i < handles.length; i++) {
    if (Math.abs(handles[i].offsetFromBottom - offset) < 1) {
      return  // User already added at this position
    }
  }

  // Get global wspornik settings for this ladder
  const globalDistance = (ladderNum === 1) ? globalWspornikDistance1 : globalWspornikDistance2
  const globalType = getWspornikTypeFromDistance(globalDistance)
  const isDisabled = (ladderNum === 1) ? wspornikDisabled1 : wspornikDisabled2

  // Add auto-added handle with current global settings
  handles.push({
    offsetFromBottom: offset,
    autoAdded: true,
    connType: 'sciskany',
    wspornikType: isDisabled ? 'none' : globalType,
    wspornikDistance: globalDistance
  })
}

function getTotalHeightForLadder(ladderNum: number): number {
  let x7Count: number
  let finalRungs: number | string

  if (ladderNum === 1) {
    x7Count = numX7Ladders1
    finalRungs = finalLadderRungs1
  } else {
    // For ladder 2, check if we should use props.descentLadder (brackets mode) or internal variables (attic mode)
    if (props.descentMountType === 'brackets' && props.descentLadder) {
      x7Count = props.descentLadder.repeatLadder7 || 0
      finalRungs = props.descentLadder.endLadderRungs || 0
    } else {
      x7Count = numX7Ladders2
      finalRungs = finalLadderRungs2
    }
  }

  let total = x7Count * getLadderHeight(7)
  let sectionCount = x7Count

  if (finalRungs === '7alt') {
    total += getLadderHeight('7alt')
    sectionCount++
  } else if (typeof finalRungs === 'number' && finalRungs > 0) {
    total += getLadderHeight(finalRungs)
    sectionCount++
  }

  // Add 3mm gaps between sections
  if (sectionCount > 1) {
    total += (sectionCount - 1) * 3
  }

  return total
}

function getLadderSectionsForLadder(ladderNum: number): Array<{ rungs: number; type: string }> {
  let x7Count: number
  let finalRungs: number | string

  if (ladderNum === 1) {
    x7Count = numX7Ladders1
    finalRungs = finalLadderRungs1
  } else {
    // For ladder 2, check if we should use props.descentLadder (brackets mode) or internal variables (attic mode)
    if (props.descentMountType === 'brackets' && props.descentLadder) {
      x7Count = props.descentLadder.repeatLadder7 || 0
      finalRungs = props.descentLadder.endLadderRungs || 0
    } else {
      x7Count = numX7Ladders2
      finalRungs = finalLadderRungs2
    }
  }

  const sections: Array<{ rungs: number; type: string }> = []

  for (let i = 0; i < x7Count; i++) {
    sections.push({ rungs: 7, type: 'standard' })
  }

  if (finalRungs === '7alt') {
    sections.push({ rungs: 7, type: 'alt' })
  } else if (typeof finalRungs === 'number' && finalRungs > 0) {
    sections.push({ rungs: finalRungs, type: 'final' })
  }

  return sections
}

function getConnectorTypesForLadder(ladderNum: number): string[] {
  return (ladderNum === 1) ? connectorTypes1 : connectorTypes2
}

function getWspornikTypesForLadder(ladderNum: number): string[] {
  return (ladderNum === 1) ? wspornikTypes1 : wspornikTypes2
}

function getDefaultWspornikForLadder(ladderNum: number): string {
  if (ladderNum === 1 && wspornikDisabled1) return 'none'
  if (ladderNum === 2 && wspornikDisabled2) return 'none'
  return (ladderNum === 1) ? defaultWspornik1 : defaultWspornik2
}

function getWspornikTypeFromDistance(distanceMm: number): string {
  if (distanceMm < 260) return 'krotki'
  if (distanceMm < 360) return 'sredni'
  return 'dlugi'
}

function updateGlobalWspornikDistance(ladderNum: number, distanceMm: number) {
  // Gdy drabina stoi na wspornikach typu C, zmiana odleglosci ma wybrac inny
  // wariant TEJ rodziny, a nie zrzucic uzytkownika z powrotem na "krotki".
  const biezacy = (ladderNum === 1) ? defaultWspornik1 : defaultWspornik2
  const type = isTypC(biezacy)
    ? typCDlaOdleglosci(distanceMm)
    : getWspornikTypeFromDistance(distanceMm)

  if (ladderNum === 1) {
    globalWspornikDistance1 = distanceMm
    defaultWspornik1 = type
    // Update all wsporniki (like original configurator)
    for (let i = 0; i < wspornikTypes1.length; i++) {
      if (wspornikTypes1[i] !== 'none') {
        wspornikTypes1[i] = type
        wspornikDistances1[i] = distanceMm
      }
    }
    // Update midRungBracket
    if (midRungBracketWspornikType1 !== 'none') {
      midRungBracketWspornikType1 = type
      midRungBracketDistance1 = distanceMm
    }
    // Update sciskane handles
    for (const handle of sciskaneHandles1) {
      if (handle.wspornikType !== 'none') {
        handle.wspornikType = type
        handle.wspornikDistance = distanceMm
      }
    }
  } else {
    globalWspornikDistance2 = distanceMm
    defaultWspornik2 = type
    // Update all wsporniki (like original configurator)
    for (let i = 0; i < wspornikTypes2.length; i++) {
      if (wspornikTypes2[i] !== 'none') {
        wspornikTypes2[i] = type
        wspornikDistances2[i] = distanceMm
      }
    }
    // Update midRungBracket
    if (midRungBracketWspornikType2 !== 'none') {
      midRungBracketWspornikType2 = type
      midRungBracketDistance2 = distanceMm
    }
    // Update sciskane handles
    for (const handle of sciskaneHandles2) {
      if (handle.wspornikType !== 'none') {
        handle.wspornikType = type
        handle.wspornikDistance = distanceMm
      }
    }
  }
}

// ============================================
// CREATE CONNECTOR (uchwyt/lacznik/sciskany)
// ============================================
function createConnector(type: string, side: string, ladderNum: number, isMidRung = false, elementId?: string): THREE.Group {
  type = type || 'uchwyt'
  side = side || 'left'
  ladderNum = ladderNum || 1

  let sourceModel: THREE.Group | null = null

  if (type === 'lacznik' && loadedModels.lacznik) {
    sourceModel = loadedModels.lacznik
  } else if (type === 'uchwytPoreczy' && loadedModels.uchwytPoreczy) {
    sourceModel = loadedModels.uchwytPoreczy
  } else if (type === 'sciskany' && loadedModels.sciskany) {
    sourceModel = loadedModels.sciskany
  } else if (loadedModels.uchwyt) {
    sourceModel = loadedModels.uchwyt
  }

  if (sourceModel) {
    const model = sourceModel.clone(true)
    model.scale.set(SCALE, SCALE, SCALE)

    const geoConfig = ladderGeometryConfig[ladderNum]
    let rot: { x: number; y: number; z: number }

    if (type === 'sciskany') {
      rot = geoConfig.sciskane[side as 'left' | 'right']
      model.rotation.set(rot.x, rot.y, rot.z)
    } else {
      rot = geoConfig.connector[side as 'left' | 'right']
      let extraRotZ = 0
      if (type === 'uchwyt') {
        extraRotZ = Math.PI * -0.5 + Math.PI
      }
      model.rotation.set(rot.x, rot.y, rot.z + extraRotZ)
    }

    model.userData.isConnector = true
    model.userData.connectorType = type
    model.userData.ladderNum = ladderNum
    model.userData.side = side  // WAŻNE: dla unikalnego elementId
    model.userData.isMidRungBracket = isMidRung
    if (elementId) {
      model.userData.elementId = elementId
    }

    model.traverse((child) => {
      child.userData.isConnector = true
      child.userData.connectorType = type
      child.userData.ladderNum = ladderNum
      child.userData.side = side
      child.userData.isMidRungBracket = isMidRung
      if (elementId) {
        child.userData.elementId = elementId  // Same ID as parent
      }
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        const mesh = child as THREE.Mesh
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone()
        ;(mesh.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.65)
      }
    })

    addOutlineToModel(model)
    connectorObjects.push(model)
    return model
  }

  // Fallback
  const fallbackGroup = new THREE.Group()
  fallbackGroup.userData.isConnector = true
  if (elementId) {
    fallbackGroup.userData.elementId = elementId
  }
  fallbackGroup.userData.connectorType = type
  fallbackGroup.userData.ladderNum = ladderNum
  fallbackGroup.userData.isMidRungBracket = isMidRung
  connectorObjects.push(fallbackGroup)
  return fallbackGroup
}

// ============================================
// CREATE WSPORNIK (wall bracket) - FIXED ROTATION
// ============================================
function createWspornik(type: string, side: string, ladderNum: number, isMidRung = false, elementId?: string): THREE.Group | null {
  // Skip if wsporniki are disabled for this ladder
  if ((ladderNum === 1 && wspornikDisabled1) || (ladderNum === 2 && wspornikDisabled2)) {
    return null
  }

  type = type || 'krotki'
  side = side || 'left'
  ladderNum = ladderNum || 1

  let sourceModel: THREE.Group | null = null
  // For ladder 2, swap sides for model selection
  const effectiveSide = (ladderNum === 2) ? (side === 'left' ? 'right' : 'left') : side

  // Typ C: jeden model na pozycje, nie para. Strona 'right' nie tworzy nic -
  // wszystkie miejsca wywolania sprawdzaja wynik, wiec wystarczy tu zwrocic null.
  if (isTypC(type)) {
    if (side === 'right') return null
    sourceModel = loadedModels.wspornikTypC[type] || null
  } else if (type === 'krotki' && loadedModels.wspornikKrotki) {
    sourceModel = loadedModels.wspornikKrotki
  } else if (type === 'sredni') {
    // Swap model for sredni based on effectiveSide
    if (effectiveSide === 'left' && loadedModels.wspornikSredniPrawy) {
      sourceModel = loadedModels.wspornikSredniPrawy
    } else if (effectiveSide === 'right' && loadedModels.wspornikSredniLewy) {
      sourceModel = loadedModels.wspornikSredniLewy
    }
  } else if (type === 'dlugi') {
    if (effectiveSide === 'left' && loadedModels.wspornikDlugiLewy) {
      sourceModel = loadedModels.wspornikDlugiLewy
    } else if (effectiveSide === 'right' && loadedModels.wspornikDlugiPrawy) {
      sourceModel = loadedModels.wspornikDlugiPrawy
    }
  }

  if (!sourceModel) return null

  const model = sourceModel.clone(true)
  model.scale.set(SCALE, SCALE, SCALE)

  // Get base rotation from config
  const geoConfig = ladderGeometryConfig[ladderNum]
  const rot = geoConfig.wspornik[side as 'left' | 'right']

  // FIXED ROTATION LOGIC - matching original
  let extraRotX = 0
  let extraRotY = 0
  let extraRotZ = 0

  if (isTypC(type)) {
    // Obroty jak przy wsporniku krotkim - typ C jest montowany tak samo,
    // tyle ze jednym elementem na srodku zamiast pary przy szczeblinach -
    // plus cwierc obrotu w bok, bo modele przyszly inaczej ulozone.
    extraRotX = Math.PI * -0.5
    extraRotY = Math.PI * 0.5
    extraRotZ = 0
  } else if (type === 'dlugi' || type === 'sredni') {
    extraRotX = Math.PI * 0.5  // 90° forward
    if (type === 'dlugi' && effectiveSide === 'right') {
      extraRotY = Math.PI  // 180° flip for right long
    }
    if (type === 'sredni' && effectiveSide === 'right') {
      extraRotY = Math.PI  // 180° flip for right medium
    }
  } else if (type === 'krotki') {
    extraRotX = Math.PI * -0.5  // -90° up
    // Extra Z rotation for short bracket
    if (effectiveSide === 'left') {
      extraRotZ = Math.PI * 0.5 + Math.PI  // 270°
    } else {
      extraRotZ = Math.PI * -0.5  // -90°
    }
  }

  // For ladder 2: entire pair rotated 180°
  if (ladderNum === 2) {
    extraRotZ += Math.PI
  }

  model.rotation.set(rot.x + extraRotX, rot.y + extraRotY, rot.z + extraRotZ)

  if (isTypC(type)) {
    // Korekta ulozenia modelu, opisana tak, jak sie ja oglada na scenie:
    // najpierw gorna sciana idzie do tylu, potem przednia w lewo.
    // Obracamy wokol osi SWIATA i po ustawieniu rotacji bazowej, wiec obie
    // liczby czyta sie niezaleznie od tego, co siedzi wyzej w extraRot*.
    // Zmiana znaku obraca w druga strone, wyzerowanie znosi dany krok.
    model.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), TYP_C_GORA_DO_TYLU)
    model.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), TYP_C_PRZOD_W_LEWO)
  }

  // Z offset - średni bliżej ściany o 50mm, długi o 100mm
  // Dla drabiny 2: odwrócona logika (dodatnie wartości)
  let baseZOffset = 0
  if (isTypC(type)) {
    // Zasieg typu C siedzi w samym modelu (kazdy wariant jest innej dlugosci),
    // wiec zamiast stalych -101 / -51 jak przy dlugim i srednim kazdy wariant
    // ma wlasne dosuniecie - patrz TYP_C_WARIANTY.przesuniecie.
    const przes = typCPrzesuniecie(type)
    baseZOffset = (ladderNum === 1) ? przes : -przes
  } else if (ladderNum === 1) {
    baseZOffset = (type === 'dlugi') ? -101 : ((type === 'sredni') ? -51 : 0)
  } else {
    // Drabina 2 - odwrócone
    baseZOffset = (type === 'dlugi') ? 101 : ((type === 'sredni') ? 51 : 0)
  }

  // Calculate X and Y offsets
  // Typ C: miejsca wywolania ustawiaja x = -RAIL_OFFSET (lewa szczeblina),
  // wiec dodanie +RAIL_OFFSET sprowadza pojedynczy wspornik na srodek drabiny.
  const extraXOffset = isTypC(type)
    ? RAIL_OFFSET + TYP_C_KOREKTA.x
    : ((type === 'dlugi') ? -3 : ((type === 'sredni') ? -4 : ((type === 'krotki') ? -1.5 : 0)))
  const extraYOffset = isTypC(type)
    ? TYP_C_KOREKTA.y
    : ((type === 'dlugi')
      ? (effectiveSide === 'right' ? -19.5 : -19)
      : ((type === 'sredni')
        ? (effectiveSide === 'right' ? -20 : -20)
        : 0))

  model.userData.isWspornik = true
  model.userData.wspornikType = type
  model.userData.ladderNum = ladderNum
  model.userData.side = side
  model.userData.isMidRungBracket = isMidRung
  model.userData.extraXOffset = extraXOffset
  model.userData.extraYOffset = extraYOffset
  model.userData.extraZOffset = baseZOffset
  if (elementId) {
    model.userData.elementId = elementId
  }

  model.traverse((child) => {
    child.userData.isWspornik = true
    child.userData.ladderNum = ladderNum
    child.userData.side = side
    child.userData.isMidRungBracket = isMidRung
    if (elementId) {
      child.userData.elementId = elementId  // Same ID as parent
    }
  })

  addOutlineToModel(model)
  wspornikObjects.push(model)
  return model
}

// ============================================
// MEASUREMENT BOXES (boxy mierzenia)
// ============================================
let measurementLine: THREE.Line | null = null
let measurementLabel: THREE.Sprite | null = null
let measurementDiskTop: THREE.Mesh | null = null
let measurementDiskBottom: THREE.Mesh | null = null
let firstHoopBoxY: number | null = null  // Dół boxa magenta (góra ściany)
let lastHoopBoxY: number | null = null   // Góra boxa cyan (dół drabiny końcowej)
let lastFinalLadderBottomY: number | null = null  // Dół ostatniej drabiny końcowej

// Drugi wymiar: Dł. Drabiny (zielony → żółty)
let ladderLengthLine: THREE.Line | null = null
let ladderLengthLabel: THREE.Sprite | null = null
let ladderLengthDiskTop: THREE.Mesh | null = null
let ladderLengthDiskBottom: THREE.Mesh | null = null
let roofTopBoxY: number | null = null  // Dół zielonego boxa (góra ściany)
let finalLadderBottomBoxY: number | null = null  // Dół żółtego boxa (dół drabiny końcowej)

// Trzeci wymiar: Wys. Kosza (cyan → niebieski/podłoga)
let cageHeightLine: THREE.Line | null = null
let cageHeightLabel: THREE.Sprite | null = null
let cageHeightDiskTop: THREE.Mesh | null = null
let cageHeightDiskBottom: THREE.Mesh | null = null
let groundTopBoxY: number | null = null  // Góra niebieskiego boxa (góra podłogi)

// Czwarty wymiar: Wys. z poręczami (zielony → pomarańczowy)
let handrailHeightLine: THREE.Line | null = null
let handrailHeightLabel: THREE.Sprite | null = null
let handrailHeightDiskTop: THREE.Mesh | null = null
let handrailHeightDiskBottom: THREE.Mesh | null = null
let handrailTopBoxY: number | null = null  // Dół pomarańczowego boxa (góra poręczy)

// Info label z tyłu sceny
let infoLabel: THREE.Sprite | null = null
let atticInfoLabel: THREE.Sprite | null = null  // Info label dla attyki

// Piąty wymiar: Wysokość zawieszenia (żółty → niebieski) - gdy lastRungToGround > 350mm
let suspensionHeightLine: THREE.Line | null = null
let suspensionHeightLabel: THREE.Sprite | null = null
let suspensionHeightDiskTop: THREE.Mesh | null = null
let suspensionHeightDiskBottom: THREE.Mesh | null = null

// Szósty wymiar: Zielony → Czerwony (dół zielonego → dół czerwonego)
let greenRedLine: THREE.Line | null = null
let greenRedLabel: THREE.Sprite | null = null
let greenRedDiskTop: THREE.Mesh | null = null
let greenRedDiskBottom: THREE.Mesh | null = null
let wallTopBoxY: number | null = null  // Dół czerwonego boxa (góra ściany bez platformOffset)
let descentWallTopBoxY: number | null = null  // Góra ściany zejścia (dół fioletowego boxa)

// Siódmy wymiar: Dł. Drabiny strona zejścia (fioletowy → zielony)
let descentLadderLengthLine: THREE.Line | null = null
let descentLadderLengthLabel: THREE.Sprite | null = null
let descentLadderLengthDiskTop: THREE.Mesh | null = null
let descentLadderLengthDiskBottom: THREE.Mesh | null = null

// Dane do utworzenia żółtego boxa (po clearMeasurementBoxes)
let savedYellowBoxData: {
  boxYPos: number
  boxSize: number
  boxZOffset: number
  ladderNum: number
  sectionIndex: number
} | null = null

function createMeasurementBox(
  width: number,
  height: number,
  depth: number,
  position: THREE.Vector3,
  color: number = 0xff00ff
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth)

  // Widoczne tylko w debug mode
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  })
  const box = new THREE.Mesh(geometry, material)
  box.position.copy(position)
  box.userData.isMeasurementBox = true // Miarka ignoruje gdy showMeasurementBoxes OFF
  box.visible = showMeasurementBoxes // Kontrolowane osobną zmienną
  measurementBoxes.push(box)

  return box
}

function clearMeasurementBoxes() {
  for (const box of measurementBoxes) {
    ladderContainer.remove(box)
    box.geometry.dispose()
    ;(box.material as THREE.MeshBasicMaterial).dispose()
  }
  measurementBoxes = []

  // Wyczyść linię i label
  if (measurementLine) {
    ladderContainer.remove(measurementLine)
    measurementLine.geometry.dispose()
    ;(measurementLine.material as THREE.LineBasicMaterial).dispose()
    measurementLine = null
  }
  if (measurementLabel) {
    ladderContainer.remove(measurementLabel)
    ;(measurementLabel.material as THREE.SpriteMaterial).dispose()
    measurementLabel = null
  }

  // Reset pozycji boxów kosza (te są tworzone w renderSafetyCage po clearMeasurementBoxes)
  firstHoopBoxY = null
  lastHoopBoxY = null
  // NIE resetuj lastFinalLadderBottomY tutaj - jest ustawiane przed renderSafetyCage

  // Wyczyść drugi wymiar (Dł. Drabiny)
  if (ladderLengthLine) {
    ladderContainer.remove(ladderLengthLine)
    ladderLengthLine.geometry.dispose()
    ;(ladderLengthLine.material as THREE.LineBasicMaterial).dispose()
    ladderLengthLine = null
  }
  if (ladderLengthLabel) {
    ladderContainer.remove(ladderLengthLabel)
    ;(ladderLengthLabel.material as THREE.SpriteMaterial).dispose()
    ladderLengthLabel = null
  }
  if (ladderLengthDiskTop) {
    ladderContainer.remove(ladderLengthDiskTop)
    ladderLengthDiskTop.geometry.dispose()
    ;(ladderLengthDiskTop.material as THREE.MeshBasicMaterial).dispose()
    ladderLengthDiskTop = null
  }
  if (ladderLengthDiskBottom) {
    ladderContainer.remove(ladderLengthDiskBottom)
    ladderLengthDiskBottom.geometry.dispose()
    ;(ladderLengthDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    ladderLengthDiskBottom = null
  }
  // NIE resetuj roofTopBoxY i finalLadderBottomBoxY tutaj!
  // Są one resetowane na początku createLadder() i ustawiane w różnych miejscach.
}

// Tworzy żółty box mierzenia (wywoływane PO clearMeasurementBoxes w renderSafetyCage)
function renderYellowMeasurementBox() {
  if (!savedYellowBoxData) return

  const { boxYPos, boxSize, boxZOffset, ladderNum, sectionIndex } = savedYellowBoxData

  const measureBox = createMeasurementBox(
    boxSize,
    boxSize,
    boxSize,
    new THREE.Vector3(0, boxYPos, boxZOffset),
    0xffff00 // Żółty
  )
  measureBox.userData.measurementBoxType = 'finalLadderBottom'
  measureBox.userData.ladderNum = ladderNum
  measureBox.userData.sectionIndex = sectionIndex
  ladderContainer.add(measureBox)
}

function updateMeasurementBoxesVisibility() {
  // Boxy mierzenia - widoczne gdy showMeasurementBoxes = true
  for (const box of measurementBoxes) {
    box.visible = showMeasurementBoxes
  }
  // Linia, label i dyski - widoczne gdy showDimensions = true
  if (measurementLine) measurementLine.visible = showDimensions
  if (measurementLabel) measurementLabel.visible = showDimensions
  if (measurementDiskTop) measurementDiskTop.visible = showDimensions
  if (measurementDiskBottom) measurementDiskBottom.visible = showDimensions
  // Drugi wymiar (Dł. Drabiny)
  if (ladderLengthLine) ladderLengthLine.visible = showDimensions
  if (ladderLengthLabel) ladderLengthLabel.visible = showDimensions
  if (ladderLengthDiskTop) ladderLengthDiskTop.visible = showDimensions
  if (ladderLengthDiskBottom) ladderLengthDiskBottom.visible = showDimensions
  // Trzeci wymiar (Wys. Kosza)
  if (cageHeightLine) cageHeightLine.visible = showDimensions
  if (cageHeightLabel) cageHeightLabel.visible = showDimensions
  if (cageHeightDiskTop) cageHeightDiskTop.visible = showDimensions
  if (cageHeightDiskBottom) cageHeightDiskBottom.visible = showDimensions
  // Czwarty wymiar (Wys. z poręczami)
  if (handrailHeightLine) handrailHeightLine.visible = showDimensions
  if (handrailHeightLabel) handrailHeightLabel.visible = showDimensions
  if (handrailHeightDiskTop) handrailHeightDiskTop.visible = showDimensions
  if (handrailHeightDiskBottom) handrailHeightDiskBottom.visible = showDimensions
  // Info label
  if (infoLabel) infoLabel.visible = showDimensions
  if (atticInfoLabel) atticInfoLabel.visible = showDimensions
  // Piąty wymiar (Wys. zawieszenia)
  if (suspensionHeightLine) suspensionHeightLine.visible = showDimensions
  if (suspensionHeightLabel) suspensionHeightLabel.visible = showDimensions
  if (suspensionHeightDiskTop) suspensionHeightDiskTop.visible = showDimensions
  if (suspensionHeightDiskBottom) suspensionHeightDiskBottom.visible = showDimensions
  if (greenRedLine) greenRedLine.visible = showDimensions
  if (greenRedLabel) greenRedLabel.visible = showDimensions
  if (greenRedDiskTop) greenRedDiskTop.visible = showDimensions
  if (greenRedDiskBottom) greenRedDiskBottom.visible = showDimensions
  if (descentLadderLengthLine) descentLadderLengthLine.visible = showDimensions
  if (descentLadderLengthLabel) descentLadderLengthLabel.visible = showDimensions
  if (descentLadderLengthDiskTop) descentLadderLengthDiskTop.visible = showDimensions
  if (descentLadderLengthDiskBottom) descentLadderLengthDiskBottom.visible = showDimensions
}

function drawMeasurementLineBetweenBoxes(zPos: number) {
  // Usuń poprzednią linię, label i dyski
  if (measurementLine) {
    ladderContainer.remove(measurementLine)
    measurementLine.geometry.dispose()
    ;(measurementLine.material as THREE.LineBasicMaterial).dispose()
    measurementLine = null
  }
  if (measurementLabel) {
    ladderContainer.remove(measurementLabel)
    ;(measurementLabel.material as THREE.SpriteMaterial).dispose()
    measurementLabel = null
  }
  if (measurementDiskTop) {
    ladderContainer.remove(measurementDiskTop)
    measurementDiskTop.geometry.dispose()
    ;(measurementDiskTop.material as THREE.MeshBasicMaterial).dispose()
    measurementDiskTop = null
  }
  if (measurementDiskBottom) {
    ladderContainer.remove(measurementDiskBottom)
    measurementDiskBottom.geometry.dispose()
    ;(measurementDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    measurementDiskBottom = null
  }

  if (firstHoopBoxY === null || lastHoopBoxY === null) return

  // Pozycje krawędzi boxów (wysokość boxa = 50mm, połowa = 25mm)
  const boxHalfHeight = 25 * SCALE
  const magentaBottom = firstHoopBoxY - boxHalfHeight // Dół magenta
  const cyanTop = lastHoopBoxY + boxHalfHeight // Góra cyan

  // Oblicz dystans w mm (od dołu magenta do góry cyan)
  const distanceMm = Math.round(Math.abs(magentaBottom - cyanTop) / SCALE)

  // Rysuj linię od dołu magenta do góry cyan (czarna, przesunięta do przodu o 200mm)
  const xOffset = 150 * SCALE // Linia obok boxów
  const lineZOffset = 200 * SCALE // Przesunięcie do przodu
  const points = [
    new THREE.Vector3(xOffset, magentaBottom, zPos + lineZOffset),
    new THREE.Vector3(xOffset, cyanTop, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 }) // Czarna linia
  measurementLine = new THREE.Line(geometry, material)
  measurementLine.visible = showDimensions
  ladderContainer.add(measurementLine)

  // Dyski na końcach linii (płaskie kółka - wymiarowanie techniczne)
  const diskRadius = 100 * SCALE // Duży dysk
  const diskGeometry = new THREE.CircleGeometry(diskRadius, 32)
  const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  // Dysk górny (przy magenta)
  measurementDiskTop = new THREE.Mesh(diskGeometry, diskMaterial.clone())
  measurementDiskTop.position.set(xOffset, magentaBottom, zPos + lineZOffset)
  measurementDiskTop.rotation.x = -Math.PI / 2 // Poziomo - widoczny z góry, kreska z boku
  measurementDiskTop.visible = showDimensions
  ladderContainer.add(measurementDiskTop)

  // Dysk dolny (przy cyan)
  measurementDiskBottom = new THREE.Mesh(diskGeometry.clone(), diskMaterial.clone())
  measurementDiskBottom.position.set(xOffset, cyanTop, zPos + lineZOffset)
  measurementDiskBottom.rotation.x = -Math.PI / 2 // Poziomo - widoczny z góry, kreska z boku
  measurementDiskBottom.visible = showDimensions
  ladderContainer.add(measurementDiskBottom)

  // Utwórz label z dystansem (większy, obrócony 90 stopni, bez tła)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 128
  canvas.height = 512
  // Przezroczyste tło - nie rysujemy fillRect
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 64px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Obróć tekst 90 stopni
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(`${distanceMm} mm`, 0, 0)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  measurementLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii (przesunięty do przodu)
  const midY = (magentaBottom + cyanTop) / 2
  const labelZOffset = 200 * SCALE
  measurementLabel.position.set(xOffset + 300 * SCALE, midY, zPos + labelZOffset)
  measurementLabel.scale.set(1.25, 5.0, 1) // Większy, pionowy
  measurementLabel.visible = showDimensions
  measurementLabel.userData.isMeasurementLabel = true // Do skalowania z kamerą
  ladderContainer.add(measurementLabel)

  console.log(`[MeasurementBoxes] Dystans (dół magenta → góra cyan): ${distanceMm} mm`)
}

// Drugi wymiar: Dł. Drabiny (zielony → żółty) - tylko dla klasycznej/z podestem
function drawLadderLengthDimension(zPos: number, frontSide: boolean = false) {
  // Usuń poprzednią linię, label i dyski
  if (ladderLengthLine) {
    ladderContainer.remove(ladderLengthLine)
    ladderLengthLine.geometry.dispose()
    ;(ladderLengthLine.material as THREE.LineBasicMaterial).dispose()
    ladderLengthLine = null
  }
  if (ladderLengthLabel) {
    ladderContainer.remove(ladderLengthLabel)
    ;(ladderLengthLabel.material as THREE.SpriteMaterial).dispose()
    ladderLengthLabel = null
  }
  if (ladderLengthDiskTop) {
    ladderContainer.remove(ladderLengthDiskTop)
    ladderLengthDiskTop.geometry.dispose()
    ;(ladderLengthDiskTop.material as THREE.MeshBasicMaterial).dispose()
    ladderLengthDiskTop = null
  }
  if (ladderLengthDiskBottom) {
    ladderContainer.remove(ladderLengthDiskBottom)
    ladderLengthDiskBottom.geometry.dispose()
    ;(ladderLengthDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    ladderLengthDiskBottom = null
  }

  if (roofTopBoxY === null || finalLadderBottomBoxY === null) return

  // Pozycje: góra zielonego boxa → góra żółtego boxa
  const greenTop = roofTopBoxY
  const yellowTop = finalLadderBottomBoxY

  // Oblicz dystans w mm
  const distanceMm = Math.round(Math.abs(greenTop - yellowTop) / SCALE)

  // Rysuj linię - pozycja zależy od strony
  const xOffset = -150 * SCALE // Linia po lewej stronie
  const lineZOffset = frontSide ? 800 * SCALE : -900 * SCALE // Przód 800mm lub tył
  const points = [
    new THREE.Vector3(xOffset, greenTop, zPos + lineZOffset),
    new THREE.Vector3(xOffset, yellowTop, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 })
  ladderLengthLine = new THREE.Line(geometry, material)
  ladderLengthLine.visible = showDimensions
  ladderContainer.add(ladderLengthLine)

  // Dyski na końcach linii
  const diskRadius = 100 * SCALE
  const diskGeometry = new THREE.CircleGeometry(diskRadius, 32)
  const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  // Dysk górny (przy zielonym)
  ladderLengthDiskTop = new THREE.Mesh(diskGeometry, diskMaterial.clone())
  ladderLengthDiskTop.position.set(xOffset, greenTop, zPos + lineZOffset)
  ladderLengthDiskTop.rotation.x = -Math.PI / 2
  ladderLengthDiskTop.visible = showDimensions
  ladderContainer.add(ladderLengthDiskTop)

  // Dysk dolny (przy żółtym)
  ladderLengthDiskBottom = new THREE.Mesh(diskGeometry.clone(), diskMaterial.clone())
  ladderLengthDiskBottom.position.set(xOffset, yellowTop, zPos + lineZOffset)
  ladderLengthDiskBottom.rotation.x = -Math.PI / 2
  ladderLengthDiskBottom.visible = showDimensions
  ladderContainer.add(ladderLengthDiskBottom)

  // Utwórz label z dystansem i przedrostkiem "Dł. Drabiny" (bez tła)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 512
  // Przezroczyste tło - nie rysujemy fillRect
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Obróć tekst 90 stopni
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(`Dł. Drabiny`, 0, -35)
  ctx.fillText(`${distanceMm} mm`, 0, 35)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  ladderLengthLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii - offset zależy od strony
  const midY = (greenTop + yellowTop) / 2
  const labelZOffset = frontSide ? 100 * SCALE : -100 * SCALE  // Przód: 100mm, Tył: 100mm do tyłu
  ladderLengthLabel.position.set(xOffset + 300 * SCALE, midY, zPos + lineZOffset + labelZOffset)
  ladderLengthLabel.scale.set(2.5, 6.0, 1)
  ladderLengthLabel.visible = showDimensions
  ladderLengthLabel.userData.isLadderLengthLabel = true
  ladderLengthLabel.userData.frontSide = frontSide  // Zapamiętaj stronę dla skalowania
  ladderContainer.add(ladderLengthLabel)
}

// Wyczyść wymiar Wys. Kosza
function clearCageHeightDimension() {
  if (cageHeightLine) {
    ladderContainer.remove(cageHeightLine)
    cageHeightLine.geometry.dispose()
    ;(cageHeightLine.material as THREE.LineBasicMaterial).dispose()
    cageHeightLine = null
  }
  if (cageHeightLabel) {
    ladderContainer.remove(cageHeightLabel)
    ;(cageHeightLabel.material as THREE.SpriteMaterial).dispose()
    cageHeightLabel = null
  }
  if (cageHeightDiskTop) {
    ladderContainer.remove(cageHeightDiskTop)
    cageHeightDiskTop.geometry.dispose()
    ;(cageHeightDiskTop.material as THREE.MeshBasicMaterial).dispose()
    cageHeightDiskTop = null
  }
  if (cageHeightDiskBottom) {
    ladderContainer.remove(cageHeightDiskBottom)
    cageHeightDiskBottom.geometry.dispose()
    ;(cageHeightDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    cageHeightDiskBottom = null
  }
}

// Trzeci wymiar: Wys. Kosza (cyan → niebieski/podłoga)
function drawCageHeightDimension(zPos: number) {
  // Usuń poprzednią linię, label i dyski
  clearCageHeightDimension()

  if (lastHoopBoxY === null || groundTopBoxY === null) return

  // Pozycje: góra cyan → góra niebieskiego (podłoga)
  const boxHalfHeight = 25 * SCALE
  const cyanTop = lastHoopBoxY + boxHalfHeight
  const groundTop = groundTopBoxY

  // Oblicz dystans w mm
  const distanceMm = Math.round(Math.abs(cyanTop - groundTop) / SCALE)

  // Rysuj linię (w tym samym miejscu co wymiar kosza)
  const xOffset = 150 * SCALE
  const lineZOffset = 200 * SCALE
  const points = [
    new THREE.Vector3(xOffset, cyanTop, zPos + lineZOffset),
    new THREE.Vector3(xOffset, groundTop, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 })
  cageHeightLine = new THREE.Line(geometry, material)
  cageHeightLine.visible = showDimensions
  ladderContainer.add(cageHeightLine)

  // Dyski na końcach linii
  const diskRadius = 100 * SCALE
  const diskGeometry = new THREE.CircleGeometry(diskRadius, 32)
  const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  // Dysk górny (przy cyan)
  cageHeightDiskTop = new THREE.Mesh(diskGeometry, diskMaterial.clone())
  cageHeightDiskTop.position.set(xOffset, cyanTop, zPos + lineZOffset)
  cageHeightDiskTop.rotation.x = -Math.PI / 2
  cageHeightDiskTop.visible = showDimensions
  ladderContainer.add(cageHeightDiskTop)

  // Dysk dolny (przy podłodze)
  cageHeightDiskBottom = new THREE.Mesh(diskGeometry.clone(), diskMaterial.clone())
  cageHeightDiskBottom.position.set(xOffset, groundTop, zPos + lineZOffset)
  cageHeightDiskBottom.rotation.x = -Math.PI / 2
  cageHeightDiskBottom.visible = showDimensions
  ladderContainer.add(cageHeightDiskBottom)

  // Utwórz label z dystansem
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 128
  canvas.height = 512
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 64px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(`${distanceMm} mm`, 0, 0)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  cageHeightLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii
  const midY = (cyanTop + groundTop) / 2
  const labelZOffsetPos = 200 * SCALE
  cageHeightLabel.position.set(xOffset + 300 * SCALE, midY, zPos + labelZOffsetPos)
  cageHeightLabel.scale.set(1.25, 5.0, 1)
  cageHeightLabel.visible = showDimensions
  cageHeightLabel.userData.isCageHeightLabel = true
  ladderContainer.add(cageHeightLabel)
}

// Czwarty wymiar: Wys. z poręczami (zielony → pomarańczowy)
function drawHandrailHeightDimension(zPos: number, frontSide: boolean = false) {
  // Usuń poprzednią linię, label i dyski
  if (handrailHeightLine) {
    ladderContainer.remove(handrailHeightLine)
    handrailHeightLine.geometry.dispose()
    ;(handrailHeightLine.material as THREE.LineBasicMaterial).dispose()
    handrailHeightLine = null
  }
  if (handrailHeightLabel) {
    ladderContainer.remove(handrailHeightLabel)
    ;(handrailHeightLabel.material as THREE.SpriteMaterial).dispose()
    handrailHeightLabel = null
  }
  if (handrailHeightDiskTop) {
    ladderContainer.remove(handrailHeightDiskTop)
    handrailHeightDiskTop.geometry.dispose()
    ;(handrailHeightDiskTop.material as THREE.MeshBasicMaterial).dispose()
    handrailHeightDiskTop = null
  }
  if (handrailHeightDiskBottom) {
    ladderContainer.remove(handrailHeightDiskBottom)
    handrailHeightDiskBottom.geometry.dispose()
    ;(handrailHeightDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    handrailHeightDiskBottom = null
  }

  if (roofTopBoxY === null || handrailTopBoxY === null) return

  // Pozycje: dół zielonego → dół pomarańczowego (góra poręczy)
  const greenBottom = roofTopBoxY
  const orangeBottom = handrailTopBoxY

  // Oblicz dystans w mm
  const distanceMm = Math.round(Math.abs(orangeBottom - greenBottom) / SCALE)

  // Rysuj linię - pozycja zależy od strony (tak samo jak dł. drabiny)
  const xOffset = -150 * SCALE // Linia po lewej stronie
  const lineZOffset = frontSide ? 800 * SCALE : -900 * SCALE // Przód 800mm lub tył
  const points = [
    new THREE.Vector3(xOffset, greenBottom, zPos + lineZOffset),
    new THREE.Vector3(xOffset, orangeBottom, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 })
  handrailHeightLine = new THREE.Line(geometry, material)
  handrailHeightLine.visible = showDimensions
  ladderContainer.add(handrailHeightLine)

  // Dyski na końcach linii
  const diskRadius = 100 * SCALE
  const diskGeometry = new THREE.CircleGeometry(diskRadius, 32)
  const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  // Dysk dolny (przy zielonym)
  handrailHeightDiskBottom = new THREE.Mesh(diskGeometry, diskMaterial.clone())
  handrailHeightDiskBottom.position.set(xOffset, greenBottom, zPos + lineZOffset)
  handrailHeightDiskBottom.rotation.x = -Math.PI / 2
  handrailHeightDiskBottom.visible = showDimensions
  ladderContainer.add(handrailHeightDiskBottom)

  // Dysk górny (przy pomarańczowym)
  handrailHeightDiskTop = new THREE.Mesh(diskGeometry.clone(), diskMaterial.clone())
  handrailHeightDiskTop.position.set(xOffset, orangeBottom, zPos + lineZOffset)
  handrailHeightDiskTop.rotation.x = -Math.PI / 2
  handrailHeightDiskTop.visible = showDimensions
  ladderContainer.add(handrailHeightDiskTop)

  // Utwórz label z dystansem i przedrostkiem
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 512
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(`Wys. poręczy`, 0, -35)
  ctx.fillText(`${distanceMm} mm`, 0, 35)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  handrailHeightLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii - offset zależy od strony (tak samo jak dł. drabiny)
  const midY = (greenBottom + orangeBottom) / 2
  const labelZOffset = frontSide ? 100 * SCALE : -100 * SCALE  // Przód: 100mm, Tył: 100mm do tyłu
  handrailHeightLabel.position.set(xOffset + 300 * SCALE, midY, zPos + lineZOffset + labelZOffset)
  handrailHeightLabel.scale.set(2.5, 6.0, 1)
  handrailHeightLabel.visible = showDimensions
  handrailHeightLabel.userData.isHandrailHeightLabel = true
  handrailHeightLabel.userData.frontSide = frontSide
  ladderContainer.add(handrailHeightLabel)
}

// Info label z tyłu sceny (tabelka z parametrami)
function drawInfoLabel(lastRungToGround: number, wallHeight: number, wspornikType: string, hasCage: boolean, isPlatform: boolean, insulationThickness: number, zPos: number) {
  // Usuń poprzedni label
  if (infoLabel) {
    ladderContainer.remove(infoLabel)
    ;(infoLabel.material as THREE.SpriteMaterial).dispose()
    infoLabel = null
  }
  // Usuń attic info label (przy przełączaniu schematu)
  if (atticInfoLabel) {
    ladderContainer.remove(atticInfoLabel)
    ;(atticInfoLabel.material as THREE.SpriteMaterial).dispose()
    atticInfoLabel = null
  }

  // Mapowanie typów wsporników na nazwy z zakresami
  const wspornikNames: Record<string, string> = {
    'krotki': 'Regulowany 160-260mm',
    'sredni': 'Regulowany 260-360mm',
    'dlugi': 'Regulowany 360-460mm',
    'none': 'Brak'
  }
  const wspornikName = wspornikNames[wspornikType] || 'Niestandardowy'

  // Przygotuj wiersze tabeli
  const rows: Array<{label: string, value: string}> = [
    { label: 'Szerokość drabiny', value: '560 mm' },
    { label: 'Rozstaw szczebli', value: 'co 276 mm' }
  ]

  // Dodaj rozstaw obręczy tylko jeśli jest kosz
  if (hasCage) {
    rows.push({ label: 'Rozstaw obręczy', value: 'co 640 mm' })
  }

  // Dodaj długość podestu dla schematu z podestem
  if (isPlatform) {
    rows.push({ label: 'Długość podestu', value: '500 mm' })
  }

  rows.push(
    { label: 'Wspornik', value: wspornikName },
    { label: 'Wys. ściany', value: `${wallHeight} mm` },
    { label: 'Ostatni szczebel → ziemia', value: `${lastRungToGround} mm` },
    { label: 'Grubość ocieplenia', value: `${insulationThickness} mm` }
  )

  // Utwórz canvas z tabelą
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const rowHeight = 45
  const tableWidth = 750
  const col1Width = 420
  const col2Width = tableWidth - col1Width
  const tableX = 20
  const tableY = 20
  const canvasHeight = tableY + (rows.length * rowHeight) + 20

  canvas.width = tableWidth + 40
  canvas.height = canvasHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Rysuj tabelę
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 2
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 24px Arial'
  ctx.textBaseline = 'middle'

  for (let i = 0; i < rows.length; i++) {
    const y = tableY + (i * rowHeight)

    // Tło naprzemienne
    if (i % 2 === 0) {
      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(tableX, y, tableWidth, rowHeight)
    }

    // Obramowanie wiersza
    ctx.strokeRect(tableX, y, col1Width, rowHeight)
    ctx.strokeRect(tableX + col1Width, y, col2Width, rowHeight)

    // Tekst
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'left'
    ctx.fillText(rows[i].label, tableX + 10, y + rowHeight / 2)
    ctx.textAlign = 'right'
    ctx.fillText(rows[i].value, tableX + tableWidth - 10, y + rowHeight / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  infoLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja z przodu sceny, 1300mm powyżej podłogi
  const yPos = (groundTopBoxY !== null ? groundTopBoxY : 0) + 1300 * SCALE
  infoLabel.position.set(0, yPos, zPos + 2800 * SCALE)

  // Dostosuj skalę do liczby wierszy
  const scaleY = (4.0 + (rows.length * 0.25)) * 0.75
  infoLabel.scale.set(8.0, scaleY, 1)
  infoLabel.visible = showDimensions
  infoLabel.userData.isInfoLabel = true
  infoLabel.userData.baseScaleY = scaleY
  ladderContainer.add(infoLabel)
}

// Info label dla attyki (przejście przez attykę)
interface AtticInfoParams {
  wspornikEntry: string       // Wspornik strona wejścia
  wspornikDescent: string     // Wspornik strona zejścia
  hasBigfoot: boolean         // Czy jest bigfoot
  hasCage: boolean            // Czy jest kosz
  wallHeight: number          // Wysokość ściany
  lastRungToGround: number    // Ostatni szczebel → ziemia
  insulationEntry: number     // Grubość ocieplenia wejście
  insulationDescent: number   // Grubość ocieplenia zejście
}

function drawAtticInfoLabel(params: AtticInfoParams, zPos: number) {
  // Usuń poprzedni label
  if (atticInfoLabel) {
    ladderContainer.remove(atticInfoLabel)
    ;(atticInfoLabel.material as THREE.SpriteMaterial).dispose()
    atticInfoLabel = null
  }
  // Usuń klasyczny info label (przy przełączaniu schematu)
  if (infoLabel) {
    ladderContainer.remove(infoLabel)
    ;(infoLabel.material as THREE.SpriteMaterial).dispose()
    infoLabel = null
  }

  // Mapowanie typów wsporników na nazwy z zakresami
  const wspornikNames: Record<string, string> = {
    'krotki': 'Regulowany 160-260mm',
    'sredni': 'Regulowany 260-360mm',
    'dlugi': 'Regulowany 360-460mm',
    'none': 'Brak'
  }
  const wspornikEntryName = wspornikNames[params.wspornikEntry] || 'Niestandardowy'
  const wspornikDescentName = wspornikNames[params.wspornikDescent] || 'Niestandardowy'

  // Przygotuj wiersze tabeli
  const rows: Array<{label: string, value: string}> = [
    { label: 'Szerokość drabiny', value: '560 mm' },
    { label: 'Rozstaw szczebli', value: 'co 276 mm' },
    { label: 'Długość przełazu', value: '1120 mm' }
  ]

  // Dodaj rozstaw obręczy tylko jeśli jest kosz
  if (params.hasCage) {
    rows.push({ label: 'Rozstaw obręczy', value: 'co 640 mm' })
  }

  rows.push(
    { label: 'Wspornik wejście', value: wspornikEntryName },
    { label: 'Wspornik zejście', value: wspornikDescentName },
    { label: 'Bigfoot', value: params.hasBigfoot ? 'Tak' : 'Nie' },
    { label: 'Wys. ściany', value: `${params.wallHeight} mm` },
    { label: 'Ostatni szczebel → ziemia', value: `${params.lastRungToGround} mm` },
    { label: 'Ocieplenie wejście', value: `${params.insulationEntry} mm` },
    { label: 'Ocieplenie zejście', value: `${params.insulationDescent} mm` }
  )

  // Utwórz canvas z tabelą
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const rowHeight = 45
  const tableWidth = 750
  const col1Width = 420
  const col2Width = tableWidth - col1Width
  const tableX = 20
  const tableY = 20
  const canvasHeight = tableY + (rows.length * rowHeight) + 20

  canvas.width = tableWidth + 40
  canvas.height = canvasHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Rysuj tabelę
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 2
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 24px Arial'
  ctx.textBaseline = 'middle'

  for (let i = 0; i < rows.length; i++) {
    const y = tableY + (i * rowHeight)

    // Tło naprzemienne
    if (i % 2 === 0) {
      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(tableX, y, tableWidth, rowHeight)
    }

    // Obramowanie wiersza
    ctx.strokeRect(tableX, y, col1Width, rowHeight)
    ctx.strokeRect(tableX + col1Width, y, col2Width, rowHeight)

    // Tekst
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'left'
    ctx.fillText(rows[i].label, tableX + 10, y + rowHeight / 2)
    ctx.textAlign = 'right'
    ctx.fillText(rows[i].value, tableX + tableWidth - 10, y + rowHeight / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  atticInfoLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja z tyłu sceny, 1300mm powyżej podłogi
  const yPos = (groundTopBoxY !== null ? groundTopBoxY : 0) + 1300 * SCALE
  atticInfoLabel.position.set(0, yPos, zPos + 4200 * SCALE)

  // Dostosuj skalę do liczby wierszy
  const scaleY = (5.0 + (rows.length * 0.3)) * 0.75
  atticInfoLabel.scale.set(8.0, scaleY, 1)
  atticInfoLabel.visible = showDimensions
  atticInfoLabel.userData.isAtticInfoLabel = true
  atticInfoLabel.userData.baseScaleY = scaleY
  ladderContainer.add(atticInfoLabel)
}

// Piąty wymiar: Wysokość zawieszenia (żółty → niebieski) - gdy lastRungToGround > 350mm
function drawSuspensionHeightDimension(zPos: number, frontSide: boolean = false) {
  // Usuń poprzednią linię, label i dyski
  if (suspensionHeightLine) {
    ladderContainer.remove(suspensionHeightLine)
    suspensionHeightLine.geometry.dispose()
    ;(suspensionHeightLine.material as THREE.LineBasicMaterial).dispose()
    suspensionHeightLine = null
  }
  if (suspensionHeightLabel) {
    ladderContainer.remove(suspensionHeightLabel)
    ;(suspensionHeightLabel.material as THREE.SpriteMaterial).dispose()
    suspensionHeightLabel = null
  }
  if (suspensionHeightDiskTop) {
    ladderContainer.remove(suspensionHeightDiskTop)
    suspensionHeightDiskTop.geometry.dispose()
    ;(suspensionHeightDiskTop.material as THREE.MeshBasicMaterial).dispose()
    suspensionHeightDiskTop = null
  }
  if (suspensionHeightDiskBottom) {
    ladderContainer.remove(suspensionHeightDiskBottom)
    suspensionHeightDiskBottom.geometry.dispose()
    ;(suspensionHeightDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    suspensionHeightDiskBottom = null
  }

  if (finalLadderBottomBoxY === null || groundTopBoxY === null) return

  // Pozycje: góra żółtego boxa → góra niebieskiego boxa
  const yellowTop = finalLadderBottomBoxY
  const blueTop = groundTopBoxY

  // Oblicz dystans w mm
  const distanceMm = Math.round(Math.abs(yellowTop - blueTop) / SCALE)

  // Rysuj linię - pozycja zależy od strony (tak samo jak dł. drabiny)
  const xOffset = -150 * SCALE // Linia po lewej stronie
  const lineZOffset = frontSide ? 800 * SCALE : -900 * SCALE // Przód 800mm lub tył
  const points = [
    new THREE.Vector3(xOffset, yellowTop, zPos + lineZOffset),
    new THREE.Vector3(xOffset, blueTop, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 })
  suspensionHeightLine = new THREE.Line(geometry, material)
  suspensionHeightLine.visible = showDimensions
  ladderContainer.add(suspensionHeightLine)

  // Dyski na końcach linii
  const diskRadius = 100 * SCALE
  const diskGeometry = new THREE.CircleGeometry(diskRadius, 32)
  const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  // Dysk górny (przy żółtym)
  suspensionHeightDiskTop = new THREE.Mesh(diskGeometry, diskMaterial.clone())
  suspensionHeightDiskTop.position.set(xOffset, yellowTop, zPos + lineZOffset)
  suspensionHeightDiskTop.rotation.x = -Math.PI / 2
  suspensionHeightDiskTop.visible = showDimensions
  ladderContainer.add(suspensionHeightDiskTop)

  // Dysk dolny (przy niebieskim)
  suspensionHeightDiskBottom = new THREE.Mesh(diskGeometry.clone(), diskMaterial.clone())
  suspensionHeightDiskBottom.position.set(xOffset, blueTop, zPos + lineZOffset)
  suspensionHeightDiskBottom.rotation.x = -Math.PI / 2
  suspensionHeightDiskBottom.visible = showDimensions
  ladderContainer.add(suspensionHeightDiskBottom)

  // Utwórz label z dystansem i przedrostkiem "Wys. zawieszenia" (bez tła)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 512
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Obróć tekst 90 stopni
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(`Wys. zawieszenia`, 0, -35)
  ctx.fillText(`${distanceMm} mm`, 0, 35)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  suspensionHeightLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii - offset zależy od strony (tak samo jak dł. drabiny)
  const midY = (yellowTop + blueTop) / 2
  const labelZOffset = frontSide ? 100 * SCALE : -100 * SCALE  // Przód: 100mm, Tył: 100mm do tyłu
  suspensionHeightLabel.position.set(xOffset + 300 * SCALE, midY, zPos + lineZOffset + labelZOffset)
  suspensionHeightLabel.scale.set(2.5, 6.0, 1)
  suspensionHeightLabel.visible = showDimensions
  suspensionHeightLabel.userData.isSuspensionHeightLabel = true
  suspensionHeightLabel.userData.frontSide = frontSide
  ladderContainer.add(suspensionHeightLabel)
}

// Szósty wymiar: Zielony → Czerwony (dół zielonego → dół czerwonego)
function drawGreenRedDimension(zPos: number, frontSide: boolean = false) {
  // Usuń poprzednią linię, label i dyski
  if (greenRedLine) {
    ladderContainer.remove(greenRedLine)
    greenRedLine.geometry.dispose()
    ;(greenRedLine.material as THREE.LineBasicMaterial).dispose()
    greenRedLine = null
  }
  if (greenRedLabel) {
    ladderContainer.remove(greenRedLabel)
    ;(greenRedLabel.material as THREE.SpriteMaterial).dispose()
    greenRedLabel = null
  }
  if (greenRedDiskTop) {
    ladderContainer.remove(greenRedDiskTop)
    greenRedDiskTop.geometry.dispose()
    ;(greenRedDiskTop.material as THREE.MeshBasicMaterial).dispose()
    greenRedDiskTop = null
  }
  if (greenRedDiskBottom) {
    ladderContainer.remove(greenRedDiskBottom)
    greenRedDiskBottom.geometry.dispose()
    ;(greenRedDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    greenRedDiskBottom = null
  }

  if (roofTopBoxY === null || wallTopBoxY === null) return

  // Pozycje: dół zielonego → dół czerwonego
  // Dla attyki roofTopBoxY to GÓRA boxa, więc dół = góra - wysokość boxa (35mm)
  const greenBoxHeight = 35 * SCALE
  const greenBottom = roofTopBoxY - greenBoxHeight  // Faktyczny dół zielonego boxa
  const redBottom = wallTopBoxY

  // Oblicz dystans w mm
  const distanceMm = Math.round(Math.abs(greenBottom - redBottom) / SCALE)

  // Rysuj linię - pozycja przy ścianie (750mm w tył od standardowej pozycji)
  const xOffset = -150 * SCALE // Linia po lewej stronie
  const lineZOffset = frontSide ? 50 * SCALE : -900 * SCALE // 50mm w przód od ściany
  const points = [
    new THREE.Vector3(xOffset, greenBottom, zPos + lineZOffset),
    new THREE.Vector3(xOffset, redBottom, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 })
  greenRedLine = new THREE.Line(geometry, material)
  greenRedLine.visible = showDimensions
  ladderContainer.add(greenRedLine)

  // Stożki (groty) na końcach linii - imitacja wymiaru technicznego
  const coneRadius = 30 * SCALE  // Połowa rozmiaru
  const coneHeight = 75 * SCALE  // Połowa rozmiaru
  const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 16)
  const coneMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })

  // Stożek górny (przy zielonym) - skierowany w górę, przesunięty w dół o wysokość stożka
  greenRedDiskTop = new THREE.Mesh(coneGeometry, coneMaterial.clone())
  greenRedDiskTop.position.set(xOffset, greenBottom - coneHeight / 2, zPos + lineZOffset)
  // Domyślnie grot jest w górę
  greenRedDiskTop.visible = showDimensions
  ladderContainer.add(greenRedDiskTop)

  // Stożek dolny (przy czerwonym) - skierowany w dół, przesunięty w górę o wysokość stożka
  greenRedDiskBottom = new THREE.Mesh(coneGeometry.clone(), coneMaterial.clone())
  greenRedDiskBottom.position.set(xOffset, redBottom + coneHeight / 2, zPos + lineZOffset)
  greenRedDiskBottom.rotation.x = Math.PI  // Obrót by grot był w dół
  greenRedDiskBottom.visible = showDimensions
  ladderContainer.add(greenRedDiskBottom)

  // Utwórz label tylko z dystansem (bez przedrostka) - tekst poziomy, stała skala
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 128
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${distanceMm} mm`, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  greenRedLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii - stała skala, 200mm w tył
  const midY = (greenBottom + redBottom) / 2
  greenRedLabel.position.set(xOffset + 2200 * SCALE, midY, zPos + lineZOffset - 200 * SCALE)
  greenRedLabel.scale.set(4.0, 2.0, 1)
  greenRedLabel.visible = showDimensions
  greenRedLabel.userData.isGreenRedLabel = true
  greenRedLabel.userData.noScaling = true  // Flaga do pominięcia skalowania
  ladderContainer.add(greenRedLabel)
}

// Siódmy wymiar: Dł. Drabiny strona zejścia (fioletowy → zielony)
function drawDescentLadderLengthDimension(zPos: number) {
  // Usuń poprzednią linię, label i dyski
  if (descentLadderLengthLine) {
    ladderContainer.remove(descentLadderLengthLine)
    descentLadderLengthLine.geometry.dispose()
    ;(descentLadderLengthLine.material as THREE.LineBasicMaterial).dispose()
    descentLadderLengthLine = null
  }
  if (descentLadderLengthLabel) {
    ladderContainer.remove(descentLadderLengthLabel)
    ;(descentLadderLengthLabel.material as THREE.SpriteMaterial).dispose()
    descentLadderLengthLabel = null
  }
  if (descentLadderLengthDiskTop) {
    ladderContainer.remove(descentLadderLengthDiskTop)
    descentLadderLengthDiskTop.geometry.dispose()
    ;(descentLadderLengthDiskTop.material as THREE.MeshBasicMaterial).dispose()
    descentLadderLengthDiskTop = null
  }
  if (descentLadderLengthDiskBottom) {
    ladderContainer.remove(descentLadderLengthDiskBottom)
    descentLadderLengthDiskBottom.geometry.dispose()
    ;(descentLadderLengthDiskBottom.material as THREE.MeshBasicMaterial).dispose()
    descentLadderLengthDiskBottom = null
  }

  if (roofTopBoxY === null || descentWallTopBoxY === null) return

  // Pozycje: góra zielonego boxa → dół fioletowego (góra ściany zejścia)
  const greenTop = roofTopBoxY
  const purpleBottom = descentWallTopBoxY

  // Oblicz dystans w mm
  const distanceMm = Math.round(Math.abs(greenTop - purpleBottom) / SCALE)

  // Rysuj linię - z tyłu (jak klasyczna dł. drabiny), przesunięta 600mm w tył
  const xOffset = -150 * SCALE // Linia po lewej stronie
  const lineZOffset = -1500 * SCALE // Z tyłu (600mm dalej)
  const points = [
    new THREE.Vector3(xOffset, greenTop, zPos + lineZOffset),
    new THREE.Vector3(xOffset, purpleBottom, zPos + lineZOffset)
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x000000 })
  descentLadderLengthLine = new THREE.Line(geometry, material)
  descentLadderLengthLine.visible = showDimensions
  ladderContainer.add(descentLadderLengthLine)

  // Dyski na końcach linii
  const diskRadius = 100 * SCALE
  const diskGeometry = new THREE.CircleGeometry(diskRadius, 32)
  const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  // Dysk górny (przy zielonym)
  descentLadderLengthDiskTop = new THREE.Mesh(diskGeometry, diskMaterial.clone())
  descentLadderLengthDiskTop.position.set(xOffset, greenTop, zPos + lineZOffset)
  descentLadderLengthDiskTop.rotation.x = -Math.PI / 2
  descentLadderLengthDiskTop.visible = showDimensions
  ladderContainer.add(descentLadderLengthDiskTop)

  // Dysk dolny (przy fioletowym)
  descentLadderLengthDiskBottom = new THREE.Mesh(diskGeometry.clone(), diskMaterial.clone())
  descentLadderLengthDiskBottom.position.set(xOffset, purpleBottom, zPos + lineZOffset)
  descentLadderLengthDiskBottom.rotation.x = -Math.PI / 2
  descentLadderLengthDiskBottom.visible = showDimensions
  ladderContainer.add(descentLadderLengthDiskBottom)

  // Utwórz label z dystansem i przedrostkiem "Dł. Drabiny"
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 512
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Obróć tekst 90 stopni
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(`Dł. Drabiny (zejście)`, 0, -35)
  ctx.fillText(`${distanceMm} mm`, 0, 35)
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
  descentLadderLengthLabel = new THREE.Sprite(spriteMaterial)

  // Pozycja labela na środku linii, 1900mm w prawo
  const midY = (greenTop + purpleBottom) / 2
  const labelZOffset = -100 * SCALE  // 100mm do tyłu od linii
  descentLadderLengthLabel.position.set(xOffset + 2200 * SCALE, midY, zPos + lineZOffset + labelZOffset)
  descentLadderLengthLabel.scale.set(2.5, 6.0, 1)
  descentLadderLengthLabel.visible = showDimensions
  descentLadderLengthLabel.userData.isDescentLadderLengthLabel = true
  ladderContainer.add(descentLadderLengthLabel)
}

// ============================================
// RENDER SAFETY CAGE (obrecze)
// ============================================
function renderSafetyCage() {
  if (!loadedModels.obrecz) return

  // Wyczyść poprzednie boxy mierzenia
  clearMeasurementBoxes()

  const hoopSpacing = 641.7  // mm between hoops

  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)

  // Calculate top position and first hoop offset
  let topPosition = maxHeight / 2
  let firstHoopOffset: number

  if (handrailType === 'safety' || handrailType === 'platform') {
    topPosition += DIMS.handrailVertical
    firstHoopOffset = 25
  } else if (handrailType === 'attic') {
    topPosition += DIMS.atticRailHeight
    firstHoopOffset = 25
  } else {
    firstHoopOffset = 294.3
  }

  // Render for ladder 1
  const canRender1 = safetyCageCount1 > 0 && (height1 > 0 || handrailType === 'safety' || handrailType === 'platform' || handrailType === 'attic')
  if (canRender1) {
    const geoConfig1 = ladderGeometryConfig[1]

    for (let i = 0; i < safetyCageCount1; i++) {
      const yPos = topPosition - firstHoopOffset - (i * hoopSpacing)

      const hoop = loadedModels.obrecz.clone(true)
      hoop.scale.set(SCALE, SCALE, SCALE)
      hoop.rotation.x = Math.PI * 0.5
      hoop.rotation.z = geoConfig1.rotationZ
      hoop.position.x = 0
      hoop.position.y = yPos * SCALE
      hoop.position.z = (geoConfig1.zOffset + 241) * SCALE
      hoop.userData.isSafetyCage = true
      hoop.userData.ladderNum = 1
      const hoopElementId = `cage_hoop_1_${i}`
      hoop.userData.elementId = hoopElementId
      hoop.traverse((child) => {
        child.userData.isSafetyCage = true
        child.userData.ladderNum = 1
        child.userData.elementId = hoopElementId
      })
      addOutlineToModel(hoop)
      ladderContainer.add(hoop)

      // Box mierzenia na górze pierwszej obręczy (magenta)
      if (i === 0) {
        const boxHeight = 50 * SCALE
        const boxWidth = 100 * SCALE
        const boxDepth = 100 * SCALE
        const boxZOffset = 334 * SCALE
        const boxYPos = (yPos + 45) * SCALE // 45mm nad obręczą

        const measureBox = createMeasurementBox(
          boxWidth,
          boxHeight,
          boxDepth,
          new THREE.Vector3(0, boxYPos, (geoConfig1.zOffset + 241) * SCALE + boxZOffset),
          0xff00ff // Magenta
        )
        measureBox.userData.measurementBoxType = 'firstHoopTop'
        measureBox.userData.ladderNum = 1
        ladderContainer.add(measureBox)

        // Zapisz pozycję Y dla pomiaru
        firstHoopBoxY = boxYPos
      }

      // Box mierzenia na dole ostatniej obręczy (cyan)
      if (i === safetyCageCount1 - 1) {
        const boxHeight = 50 * SCALE
        const boxWidth = 100 * SCALE
        const boxDepth = 100 * SCALE
        const boxZOffset = 334 * SCALE
        const boxYPos = (yPos - 45) * SCALE // -45mm od środka obręczy

        const measureBox = createMeasurementBox(
          boxWidth,
          boxHeight,
          boxDepth,
          new THREE.Vector3(0, boxYPos, (geoConfig1.zOffset + 241) * SCALE + boxZOffset),
          0x00ffff // Cyan
        )
        measureBox.userData.measurementBoxType = 'lastHoopBottom'
        measureBox.userData.ladderNum = 1
        ladderContainer.add(measureBox)

        // Zapisz pozycję Y dla pomiaru
        lastHoopBoxY = boxYPos

        // Rysuj linię między boxami
        drawMeasurementLineBetweenBoxes((geoConfig1.zOffset + 241) * SCALE + boxZOffset)
      }
    }

    // Cage closing (zamykanie)
    if (cageClosing1 && safetyCageCount1 >= 2 && loadedModels.zamykanie) {
      const lastHoopY = topPosition - firstHoopOffset - ((safetyCageCount1 - 1) * hoopSpacing)
      const closing = loadedModels.zamykanie.clone(true)
      closing.scale.set(SCALE, SCALE, SCALE)
      closing.rotation.x = Math.PI * 0.5
      closing.rotation.y = Math.PI
      closing.rotation.z = geoConfig1.rotationZ
      closing.position.x = 0
      closing.position.y = (lastHoopY - 35) * SCALE
      closing.position.z = (geoConfig1.zOffset + 241 + 4) * SCALE
      closing.userData.isCageClosing = true
      closing.userData.ladderNum = 1
      const closingElementId = `cage_closing_1`
      closing.userData.elementId = closingElementId
      closing.traverse((child) => {
        child.userData.isCageClosing = true
        child.userData.ladderNum = 1
        child.userData.elementId = closingElementId
      })
      addOutlineToModel(closing)
      ladderContainer.add(closing)
    }

    // Resting platform
    if (restingPlatform1 && safetyCageCount1 >= 2 && loadedModels.podestSpoczynkowy) {
      const middleHoopIndex = Math.floor(safetyCageCount1 / 2)
      const middleHoopY = topPosition - firstHoopOffset - (middleHoopIndex * hoopSpacing)

      const restPlatform = loadedModels.podestSpoczynkowy.clone(true)
      restPlatform.scale.set(SCALE, SCALE, SCALE)
      restPlatform.rotation.set(Math.PI * 1.5, 0, Math.PI)
      restPlatform.position.x = 0
      restPlatform.position.y = (middleHoopY + 215) * SCALE
      restPlatform.position.z = (geoConfig1.zOffset + 241 - 40) * SCALE
      restPlatform.userData.ladderNum = 1
      restPlatform.userData.isRestingPlatform = true
      const restPlatformElementId = `resting_platform_1`
      restPlatform.userData.elementId = restPlatformElementId
      restPlatform.traverse((child) => {
        child.userData.isRestingPlatform = true
        child.userData.ladderNum = 1
        child.userData.elementId = restPlatformElementId
      })
      addOutlineToModel(restPlatform)
      ladderContainer.add(restPlatform)
    }

    // Angle brackets (katowniki)
    renderAngleBrackets(safetyCageCount1, 1, topPosition, firstHoopOffset, hoopSpacing, geoConfig1)
  }

  // Render for ladder 2 (only for attic)
  const canRender2 = handrailType === 'attic' && safetyCageCount2 > 0
  if (canRender2) {
    const geoConfig2 = ladderGeometryConfig[2]

    for (let i = 0; i < safetyCageCount2; i++) {
      const yPos = topPosition - firstHoopOffset - (i * hoopSpacing)

      const hoop = loadedModels.obrecz.clone(true)
      hoop.scale.set(SCALE, SCALE, SCALE)
      hoop.rotation.x = Math.PI * 0.5
      hoop.rotation.z = geoConfig2.rotationZ
      hoop.position.x = 0
      hoop.position.y = yPos * SCALE
      hoop.position.z = (geoConfig2.zOffset - 241) * SCALE
      hoop.userData.isSafetyCage = true
      hoop.userData.ladderNum = 2
      const hoop2ElementId = `cage_hoop_2_${i}`
      hoop.userData.elementId = hoop2ElementId
      hoop.traverse((child) => {
        child.userData.isSafetyCage = true
        child.userData.ladderNum = 2
        child.userData.elementId = hoop2ElementId
      })
      addOutlineToModel(hoop)
      ladderContainer.add(hoop)
    }

    // Cage closing for ladder 2
    if (cageClosing2 && safetyCageCount2 >= 2 && loadedModels.zamykanie) {
      const lastHoopY = topPosition - firstHoopOffset - ((safetyCageCount2 - 1) * hoopSpacing)
      const closing = loadedModels.zamykanie.clone(true)
      closing.scale.set(SCALE, SCALE, SCALE)
      closing.rotation.x = Math.PI * 0.5
      closing.rotation.y = Math.PI
      closing.rotation.z = geoConfig2.rotationZ
      closing.position.x = 0
      closing.position.y = (lastHoopY - 35) * SCALE
      closing.position.z = (geoConfig2.zOffset - 241 - 4) * SCALE
      closing.userData.isCageClosing = true
      closing.userData.ladderNum = 2
      const closing2ElementId = `cage_closing_2`
      closing.userData.elementId = closing2ElementId
      closing.traverse((child) => {
        child.userData.isCageClosing = true
        child.userData.ladderNum = 2
        child.userData.elementId = closing2ElementId
      })
      addOutlineToModel(closing)
      ladderContainer.add(closing)
    }

    // Angle brackets for ladder 2
    renderAngleBrackets(safetyCageCount2, 2, topPosition, firstHoopOffset, hoopSpacing, geoConfig2)
  }
}

// ============================================
// RENDER ANGLE BRACKETS (katowniki)
// ============================================
function renderAngleBrackets(
  hoopCount: number,
  ladderNum: number,
  topPos: number,
  firstOffset: number,
  spacing: number,
  geoConfig: typeof ladderGeometryConfig[1]
) {
  const brackets = calculateAngleBrackets(hoopCount)
  const bracketAngles = [90, 135, 180, 225, 270]
  const hoopRadius = 332.5

  for (let b = 0; b < brackets.length; b++) {
    const bracket = brackets[b]
    const radiusOffset = (b % 2 === 1) ? 3 : 0
    const typeRadiusOffset = (bracket.type !== 'x2') ? 7 : 0
    const currentRadius = hoopRadius + radiusOffset + typeRadiusOffset

    for (let a = 0; a < bracketAngles.length; a++) {
      let angle = bracketAngles[a]
      if (ladderNum === 2) {
        angle += 180
      }
      const angleRad = angle * Math.PI / 180

      let model: THREE.Group | null = null
      if (bracket.type === 'x2' && loadedModels.katownikX2) {
        model = loadedModels.katownikX2.clone(true)
      } else if (bracket.type === 'x3' && loadedModels.katownikX3) {
        model = loadedModels.katownikX3.clone(true)
      } else if (bracket.type === 'x4' && loadedModels.katownikX4) {
        model = loadedModels.katownikX4.clone(true)
      }

      if (model) {
        let bracketYOffset: number
        if (bracket.type === 'x4') {
          bracketYOffset = 958
        } else if (bracket.type === 'x3') {
          bracketYOffset = 958 - (spacing / 2)
        } else {
          bracketYOffset = 958 - spacing
        }
        const yPos = topPos - firstOffset - (bracket.startHoop * spacing) - bracketYOffset

        const xOffset = -currentRadius * Math.sin(angleRad)
        const zOffset = -currentRadius * Math.cos(angleRad)

        model.scale.set(SCALE, SCALE, SCALE)

        const rotationsX4X3 = [90, 0, 270, 180, 90]
        const rotationsX2 = [-45, 225, 135, 45, -45]

        let extraRotation: number
        if (bracket.type === 'x2') {
          extraRotation = rotationsX2[a] * Math.PI / 180
        } else {
          extraRotation = rotationsX4X3[a] * Math.PI / 180
        }

        model.rotation.order = 'XZY'
        model.rotation.x = Math.PI / 2
        model.rotation.z = angleRad + extraRotation

        model.position.x = xOffset * SCALE
        model.position.y = yPos * SCALE

        const bracketZOffset = 15
        if (ladderNum === 1) {
          model.position.z = (geoConfig.zOffset + 241 - 50 - bracketZOffset + zOffset) * SCALE
        } else {
          model.position.z = (geoConfig.zOffset - 241 + 50 + bracketZOffset + zOffset) * SCALE
        }

        model.userData.isAngleBracket = true
        model.userData.ladderNum = ladderNum
        model.userData.segments = parseInt(bracket.type.replace('x', ''))
        const modelElementId = `angle_bracket_${ladderNum}_${b}_${bracketAngles[a]}`
        model.userData.elementId = modelElementId
        // Propagate userData to children for BOM counting and deletion
        model.traverse((child) => {
          child.userData.isAngleBracket = true
          child.userData.ladderNum = ladderNum
          child.userData.segments = parseInt(bracket.type.replace('x', ''))
          child.userData.elementId = modelElementId  // Same ID as parent
        })
        addOutlineToModel(model)
        ladderContainer.add(model)
      }
    }
  }
}

function calculateAngleBrackets(hoopCount: number): Array<{ type: string; startHoop: number }> {
  if (hoopCount <= 1) return []
  if (hoopCount === 2) return [{ type: 'x2', startHoop: 0 }]
  if (hoopCount === 3) return [{ type: 'x3', startHoop: 0 }]

  const brackets: Array<{ type: string; startHoop: number }> = []
  let coveredHoles = 0
  let currentHoop = 0
  let isFirst = true

  while (coveredHoles < hoopCount) {
    const remaining = hoopCount - coveredHoles
    let bracketType: string
    let holesAdded: number

    if (isFirst) {
      if (remaining >= 4) {
        bracketType = 'x4'
        holesAdded = 4
      } else if (remaining === 3) {
        bracketType = 'x3'
        holesAdded = 3
      } else {
        bracketType = 'x2'
        holesAdded = 2
      }
      isFirst = false
    } else {
      if (remaining >= 3) {
        bracketType = 'x4'
        holesAdded = 3
      } else if (remaining === 2) {
        bracketType = 'x3'
        holesAdded = 2
      } else {
        bracketType = 'x2'
        holesAdded = 1
      }
    }

    brackets.push({ type: bracketType, startHoop: currentHoop })
    coveredHoles += holesAdded

    if (bracketType === 'x4') {
      currentHoop += 3
    } else if (bracketType === 'x3') {
      currentHoop += 2
    } else {
      currentHoop += 1
    }
  }

  return brackets
}

// ============================================
// CREATE OBSTACLES
// ============================================
function createObstacles() {
  // Clear previous obstacles
  obstacleObjects.forEach(obj => ladderContainer.remove(obj))
  obstacleObjects = []

  const hasObstacles = obstaclesFromConfigurator && obstaclesFromConfigurator.length > 0
  const hasEave = props.eave && props.eave.height > 0
  const isAtticPassage = props.scheme === 'attic-passage'

  // Return only if no obstacles AND no eave AND not attic-passage
  if (!hasObstacles && !hasEave && !isAtticPassage) return
  if (!showWall || wallHeightConfig <= 0) return

  const height1 = getTotalHeightForLadder(1)
  const ladderTop = height1 / 2

  // Oblicz topOffset tak samo jak przy tworzeniu podłogi/ściany
  let topOffset: number
  if (props.scheme === 'attic-passage') {
    const atticDist = props.atticPlatformDistance ?? 0
    topOffset = -161 + 511 - atticDist
  } else {
    topOffset = (handrailType === 'platform') ? -211 : -161
  }

  const groundLevel = ladderTop - wallHeightConfig + topOffset
  const groundThickness = 50

  // Offset dla custom-base - podniesienie o 110mm
  const customBaseOffset = props.descentMountType === 'custom-base' ? 0 : 0

  // Góra podłogi = środek podłogi + połowa grubości
  const groundTopY = groundLevel + customBaseOffset + (groundThickness / 2)

  // Grubość ściany - dla attyki używaj prop
  const wallThickness = (props.scheme === 'attic-passage') ? (props.atticWallThickness || 250) : 250
  const wallZ = -(globalWspornikDistance1 + (wallThickness / 2) + 33)

  const obstacleMaterialBlue = new THREE.MeshLambertMaterial({
    color: 0x3b82f6,  // Nice blue
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  })

  const obstacleMaterialGreen = new THREE.MeshLambertMaterial({
    color: 0x22c55e,  // Green for wall-point
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  })

  // Window obstacles
  if (hasObstacles) {
  for (const obs of obstaclesFromConfigurator) {
    const isWallPoint = obs.type === 'wall-point'
    const obsWidth = isWallPoint ? 1600 : 800  // wall-point 2x szerszy
    const obsHeight = obs.heightMm
    const obsDepth = 30
    const obstacleMaterial = isWallPoint ? obstacleMaterialGreen : obstacleMaterialBlue

    // Pozycja Y - dół przeszkody na górze podłogi + wysokość od ziemi
    const obsCenterY = groundTopY + obs.bottomHeightMm + obsHeight / 2

    const wallFrontZ = wallZ + wallThickness / 2
    const obsCenterZ = wallFrontZ + obsDepth / 2 + 2

    const obsGeometry = new THREE.BoxGeometry(obsWidth * SCALE, obsHeight * SCALE, obsDepth * SCALE)
    const obsMesh = new THREE.Mesh(obsGeometry, obstacleMaterial)
    obsMesh.position.set(0, obsCenterY * SCALE, obsCenterZ * SCALE)
    obsMesh.userData.isObstacle = true
    obsMesh.userData.obstacleId = obs.id
    obsMesh.userData.isWallPoint = isWallPoint  // wall-point nie usuwa uchwytów

    ladderContainer.add(obsMesh)
    obstacleObjects.push(obsMesh)

    // Add wireframe outline
    const edges = new THREE.EdgesGeometry(obsGeometry)
    const edgeColor = isWallPoint ? 0x16a34a : 0x60a5fa  // green or blue
    const edgesMaterial = new THREE.LineBasicMaterial({ color: edgeColor, linewidth: 2 })
    const edgesMesh = new THREE.LineSegments(edges, edgesMaterial)
    edgesMesh.position.copy(obsMesh.position)
    ladderContainer.add(edgesMesh)
    obstacleObjects.push(edgesMesh)

    // === RED COLLISION ZONE (+5cm top/bottom) - debug only, skip for wall-point ===
    if (!isWallPoint) {
      const collisionMargin = 50  // 5cm = 50mm
      const collisionHeight = obsHeight + collisionMargin * 2
      const collisionGeometry = new THREE.BoxGeometry(obsWidth * SCALE, collisionHeight * SCALE, obsDepth * SCALE)
      const collisionMaterial = new THREE.MeshBasicMaterial({
        color: 0xef4444,  // Red for debug
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      })
      const collisionZoneMesh = new THREE.Mesh(collisionGeometry, collisionMaterial)
      collisionZoneMesh.position.set(0, obsCenterY * SCALE, obsCenterZ * SCALE)
      collisionZoneMesh.userData.isCollisionZone = true
      collisionZoneMesh.userData.obstacleId = obs.id
      collisionZoneMesh.userData.obstacleIndex = obstaclesFromConfigurator.indexOf(obs)
      collisionZoneMesh.visible = showDebugBboxes
      ladderContainer.add(collisionZoneMesh)
      obstacleObjects.push(collisionZoneMesh)

      // Red wireframe (debug only)
      if (showDebugBboxes) {
        const collisionEdges = new THREE.EdgesGeometry(collisionGeometry)
        const collisionEdgesMaterial = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 })
        const collisionEdgesMesh = new THREE.LineSegments(collisionEdges, collisionEdgesMaterial)
        collisionEdgesMesh.position.copy(collisionZoneMesh.position)
        ladderContainer.add(collisionEdgesMesh)
        obstacleObjects.push(collisionEdgesMesh)
      }
    }
  }
  } // end if (hasObstacles)

  // === ATTIC PASSAGE OBSTACLE - always present for attic-passage ===
  // Niewidoczna przeszkoda na górze ściany wejścia (widoczna tylko w debug mode)
  if (props.scheme === 'attic-passage' && wallHeightConfig > 0) {
    const atticObsHeight = 1000  // 1m wysokości
    const atticObsBottomFromGround = wallHeightConfig - 50  // wysokość ściany - 5cm
    const atticObsWidth = 1600  // szeroka jak wall-point
    const atticObsDepth = 30

    const atticObsCenterY = groundTopY + atticObsBottomFromGround + atticObsHeight / 2

    const wallFrontZ = wallZ + wallThickness / 2
    const atticObsCenterZ = wallFrontZ + atticObsDepth / 2 + 2

    // Fioletowy kolor dla debug
    const atticObsMaterial = new THREE.MeshLambertMaterial({
      color: 0x8b5cf6,  // Purple
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    })

    const atticObsGeometry = new THREE.BoxGeometry(atticObsWidth * SCALE, atticObsHeight * SCALE, atticObsDepth * SCALE)
    const atticObsMesh = new THREE.Mesh(atticObsGeometry, atticObsMaterial)
    atticObsMesh.position.set(0, atticObsCenterY * SCALE, atticObsCenterZ * SCALE)
    atticObsMesh.userData.isObstacle = true
    atticObsMesh.userData.isAtticPassageObstacle = true  // specjalny typ
    atticObsMesh.userData.obstacleId = -1  // special ID
    atticObsMesh.visible = showDebugBboxes  // widoczny tylko w debug mode

    ladderContainer.add(atticObsMesh)
    obstacleObjects.push(atticObsMesh)

    // Wireframe (tylko debug)
    if (showDebugBboxes) {
      const atticEdges = new THREE.EdgesGeometry(atticObsGeometry)
      const atticEdgesMaterial = new THREE.LineBasicMaterial({ color: 0xa78bfa, linewidth: 2 })
      const atticEdgesMesh = new THREE.LineSegments(atticEdges, atticEdgesMaterial)
      atticEdgesMesh.position.copy(atticObsMesh.position)
      ladderContainer.add(atticEdgesMesh)
      obstacleObjects.push(atticEdgesMesh)
    }

    // Collision zone (same size as visible obstacle)
    const atticCollisionGeometry = new THREE.BoxGeometry(atticObsWidth * SCALE, atticObsHeight * SCALE, atticObsDepth * SCALE)
    const atticCollisionMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    })
    const atticCollisionMesh = new THREE.Mesh(atticCollisionGeometry, atticCollisionMaterial)
    atticCollisionMesh.position.set(0, atticObsCenterY * SCALE, atticObsCenterZ * SCALE)
    atticCollisionMesh.userData.isCollisionZone = true
    atticCollisionMesh.userData.isAtticPassageObstacle = true
    atticCollisionMesh.userData.obstacleId = -1
    atticCollisionMesh.userData.obstacleIndex = -1
    atticCollisionMesh.visible = showDebugBboxes  // widoczny tylko w debug mode

    ladderContainer.add(atticCollisionMesh)
    obstacleObjects.push(atticCollisionMesh)
  }

  // === EAVE (OKAP) COLLISION ZONE ===
  // Add eave as collision zone if present
  if (props.eave && props.eave.height > 0) {
    const eaveHeight = props.eave.height  // mm
    const collisionMargin = 50  // 5cm safety margin below eave

    // Eave collision zone: from (wallHeight - eaveHeight - 5cm) to wallHeight
    const eaveCollisionHeight = eaveHeight + collisionMargin
    const eaveBottomFromGround = wallHeightConfig - eaveHeight - collisionMargin  // mm from ground

    const obsWidth = 800
    const obsDepth = 30

    const eaveCollisionCenterY = groundLevel + groundThickness + eaveBottomFromGround + eaveCollisionHeight / 2 - 25
    const wallFrontZ = wallZ + wallThickness / 2
    const obsCenterZ = wallFrontZ + obsDepth / 2 + 2

    const eaveCollisionGeometry = new THREE.BoxGeometry(obsWidth * SCALE, eaveCollisionHeight * SCALE, obsDepth * SCALE)
    const eaveCollisionMaterial = new THREE.MeshBasicMaterial({
      color: 0xef4444,  // Red for debug
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    })
    const eaveCollisionMesh = new THREE.Mesh(eaveCollisionGeometry, eaveCollisionMaterial)
    eaveCollisionMesh.position.set(0, eaveCollisionCenterY * SCALE, obsCenterZ * SCALE)
    eaveCollisionMesh.userData.isCollisionZone = true
    eaveCollisionMesh.userData.isEaveCollision = true
    eaveCollisionMesh.visible = showDebugBboxes
    ladderContainer.add(eaveCollisionMesh)
    obstacleObjects.push(eaveCollisionMesh)

    // Red wireframe (debug only)
    if (showDebugBboxes) {
      const eaveEdges = new THREE.EdgesGeometry(eaveCollisionGeometry)
      const eaveEdgesMaterial = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 })
      const eaveEdgesMesh = new THREE.LineSegments(eaveEdges, eaveEdgesMaterial)
      eaveEdgesMesh.position.copy(eaveCollisionMesh.position)
      ladderContainer.add(eaveEdgesMesh)
      obstacleObjects.push(eaveEdgesMesh)
    }
  }
}

// ============================================
// GREEN COLLISION BOXES (wspornik positions)
// ============================================
function createGreenCollisionBoxes() {
  // Clear previous green boxes
  greenCollisionBoxes.forEach(obj => ladderContainer.remove(obj))
  greenCollisionBoxes = []

  // Clear cached positions - always get fresh positions from wspornikObjects
  savedGreenBoxPositions = {}
  savedGreenBoxPositions2 = {}

  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)
  const isAtticMode = handrailType === 'attic'

  // === STEP 1: Get fresh positions from existing wspornikObjects ===
  for (const wsp of wspornikObjects) {
    if (wsp.userData.isWspornik && wsp.userData.side === 'left') {
      const pairIndex = wsp.userData.pairIndex
      const type = wsp.userData.wspornikType || 'krotki'
      const ladderNum = wsp.userData.ladderNum || 1

      // Save position for this pairIndex
      if (ladderNum === 1) {
        savedGreenBoxPositions[pairIndex] = {
          y: wsp.position.y,
          z: wsp.position.z,
          type
        }
      } else if (ladderNum === 2) {
        savedGreenBoxPositions2[pairIndex] = {
          y: wsp.position.y,
          z: wsp.position.z,
          type
        }
      }
    }
  }

  // === STEP 2: Collect ALL pairIndex by traversing ladderContainer (for each ladder) ===
  const pairIndicesLadder1: number[] = []
  const pairIndicesLadder2: number[] = []

  ladderContainer.traverse((child) => {
    if (child.userData && child.userData.pairIndex !== undefined &&
        !child.userData.isGreenCollisionBox && !child.userData.isSciskaneWspornik) {
      const ladderNum = child.userData.ladderNum || 1
      if (ladderNum === 1) {
        if (!pairIndicesLadder1.includes(child.userData.pairIndex)) {
          pairIndicesLadder1.push(child.userData.pairIndex)
        }
      } else if (ladderNum === 2) {
        if (!pairIndicesLadder2.includes(child.userData.pairIndex)) {
          pairIndicesLadder2.push(child.userData.pairIndex)
        }
      }
    }
  })

  if (pairIndicesLadder1.length === 0 && pairIndicesLadder2.length === 0) {
    console.log('[ThreeCanvas] No joints found for green boxes')
  }

  // === STEP 3: Create green boxes for each joint ===
  const boxWidth = 150 * SCALE
  const boxHeightBase = 180  // ~180mm for short wspornik
  const boxHeightExtra = 30  // +30mm for medium/long
  const boxDepth = 300 * SCALE

  const greenMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  })

  // Helper function to create green box for a joint
  const createGreenBoxForJoint = (
    pairIndex: number,
    ladderNum: number,
    savedPositions: Record<number, { y: number; z: number; type: string }>,
    wspornikTypesArr: string[],
    globalDistance: number,
    defaultWsp: string
  ) => {
    // Skip top handrail connector (pairIndex=0) ONLY for 'safety' handrail type
    if (handrailType === 'safety' && pairIndex === 0) {
      return
    }

    // Get wspornik type for this pairIndex
    const wspornikType = wspornikTypesArr[pairIndex] || defaultWsp
    const isLargerWspornik = wspornikType === 'sredni' || wspornikType === 'dlugi'
    const boxHeight = (boxHeightBase + (isLargerWspornik ? boxHeightExtra : 0)) * SCALE
    const yOffset = isLargerWspornik ? -20 * SCALE : 0

    // Check if we have saved position from wspornik
    const savedPos = savedPositions[pairIndex]

    if (savedPos) {
      // Use saved position
      const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
      const greenBox = new THREE.Mesh(boxGeometry, greenMaterial.clone())
      greenBox.position.set(0, savedPos.y, savedPos.z)
      greenBox.userData.isGreenCollisionBox = true
      greenBox.userData.pairIndex = pairIndex
      greenBox.userData.wspornikType = wspornikType
      greenBox.userData.ladderNum = ladderNum
      greenBox.visible = showDebugBboxes

      ladderContainer.add(greenBox)
      greenCollisionBoxes.push(greenBox)

      if (showDebugBboxes) {
        const edges = new THREE.EdgesGeometry(boxGeometry)
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
        const wireframe = new THREE.LineSegments(edges, edgesMat)
        wireframe.position.copy(greenBox.position)
        ladderContainer.add(wireframe)
        greenCollisionBoxes.push(wireframe)
      }
    } else {
      // No saved position - calculate from connector
      let connY: number | null = null

      for (const conn of connectorObjects) {
        if (conn.userData && conn.userData.pairIndex === pairIndex &&
            !conn.userData.isGreenCollisionBox && conn.userData.ladderNum === ladderNum) {
          connY = conn.position.y
          break
        }
      }

      if (connY !== null) {
        // Calculate Z position based on ladder number
        const wallThickness = 250
        const geoConfig = ladderGeometryConfig[ladderNum]
        let wspornikZ: number

        if (ladderNum === 1) {
          const wallZ = -(globalDistance + (wallThickness / 2) + 33)
          wspornikZ = (wallZ + wallThickness / 2 + 150) * SCALE
        } else {
          // Ladder 2 - wsporniki go in opposite direction (positive Z)
          const wallZ = geoConfig.zOffset + globalDistance + (wallThickness / 2) + 33
          wspornikZ = (wallZ - wallThickness / 2 - 150) * SCALE
        }

        const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
        const greenBox = new THREE.Mesh(boxGeometry, greenMaterial.clone())
        greenBox.position.set(0, connY + yOffset, wspornikZ)
        greenBox.userData.isGreenCollisionBox = true
        greenBox.userData.pairIndex = pairIndex
        greenBox.userData.wspornikType = wspornikType
        greenBox.userData.ladderNum = ladderNum
        greenBox.visible = showDebugBboxes

        // Save calculated position for future rebuilds
        savedPositions[pairIndex] = {
          y: connY + yOffset,
          z: wspornikZ,
          type: wspornikType
        }

        ladderContainer.add(greenBox)
        greenCollisionBoxes.push(greenBox)

        if (showDebugBboxes) {
          const edges = new THREE.EdgesGeometry(boxGeometry)
          const edgesMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
          const wireframe = new THREE.LineSegments(edges, edgesMat)
          wireframe.position.copy(greenBox.position)
          ladderContainer.add(wireframe)
          greenCollisionBoxes.push(wireframe)
        }
      }
    }
  }

  // Create green boxes for ladder 1
  for (const pairIndex of pairIndicesLadder1) {
    createGreenBoxForJoint(
      pairIndex, 1, savedGreenBoxPositions,
      wspornikTypes1, globalWspornikDistance1, defaultWspornik1
    )
  }

  // Create green boxes for ladder 2 (in attic mode OR when descent mount type is 'brackets')
  const shouldCreateGreenBoxesForLadder2 = isAtticMode || props.descentMountType === 'brackets'
  if (shouldCreateGreenBoxesForLadder2) {
    for (const pairIndex of pairIndicesLadder2) {
      createGreenBoxForJoint(
        pairIndex, 2, savedGreenBoxPositions2,
        wspornikTypes2, globalWspornikDistance2, defaultWspornik2
      )
    }
  }

  // === STEP 4: Create green boxes for midRungBracket D1 ===
  if (midRungBracket1 && !hiddenMidRungBracket1 && handrailType !== 'attic') {
    const midRungY = (maxHeight / 2) - 548.5
    const wspType = midRungBracketWspornikType1
    const isLong = wspType === 'sredni' || wspType === 'dlugi'
    const boxH = (isLong ? 215 : 180) * SCALE  // średnie/długie: 215mm, krótkie: 180mm
    const yOff = isLong ? -18 * SCALE : 0

    // Position Z (close to wall)
    const wallThickness = 250
    const wallZ1 = -(globalWspornikDistance1 + (wallThickness / 2) + 33)
    const boxZ1 = (wallZ1 + wallThickness / 2 + 100) * SCALE

    const boxGeometry = new THREE.BoxGeometry(120 * SCALE, boxH, 200 * SCALE)
    const sciskaneMaterial = new THREE.MeshBasicMaterial({
      color: 0x66ff66,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    })
    const greenBox = new THREE.Mesh(boxGeometry, sciskaneMaterial)
    greenBox.position.set(0, midRungY * SCALE + yOff, boxZ1)
    greenBox.userData.isGreenCollisionBox = true
    greenBox.userData.isMidRungBox = true
    greenBox.userData.wspornikType = wspType
    greenBox.userData.ladderNum = 1
    greenBox.visible = showDebugBboxes

    ladderContainer.add(greenBox)
    greenCollisionBoxes.push(greenBox)

    if (showDebugBboxes) {
      const edges = new THREE.EdgesGeometry(boxGeometry)
      const edgesMat = new THREE.LineBasicMaterial({ color: 0x66ff66, linewidth: 2 })
      const wireframe = new THREE.LineSegments(edges, edgesMat)
      wireframe.position.copy(greenBox.position)
      ladderContainer.add(wireframe)
      greenCollisionBoxes.push(wireframe)
    }
  }

  // === STEP 5: Create green boxes for sciskane handles D1 ===
  for (let i = 0; i < sciskaneHandles1.length; i++) {
    const handle = sciskaneHandles1[i]
    if (handle.hiddenByCollision) continue

    const handleY = (maxHeight / 2) - height1 + handle.offsetFromBottom
    const wspType = handle.wspornikType || defaultWspornik1
    const isLong = wspType === 'sredni' || wspType === 'dlugi'
    const boxH = (isLong ? 215 : 180) * SCALE  // średnie/długie: 215mm, krótkie: 180mm
    const yOff = isLong ? -18 * SCALE : 0

    // Position Z (close to wall)
    const wallThickness = 250
    const wallZ1 = -(globalWspornikDistance1 + (wallThickness / 2) + 33)
    const boxZ1 = (wallZ1 + wallThickness / 2 + 100) * SCALE

    const boxGeometry = new THREE.BoxGeometry(120 * SCALE, boxH, 200 * SCALE)
    const sciskaneMaterial = new THREE.MeshBasicMaterial({
      color: 0x66ff66,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    })
    const greenBox = new THREE.Mesh(boxGeometry, sciskaneMaterial)
    greenBox.position.set(0, handleY * SCALE + yOff, boxZ1)
    greenBox.userData.isGreenCollisionBox = true
    greenBox.userData.isSciskaneBox = true
    greenBox.userData.sciskaneIndex = i
    greenBox.userData.wspornikType = wspType
    greenBox.userData.ladderNum = 1
    greenBox.visible = showDebugBboxes

    ladderContainer.add(greenBox)
    greenCollisionBoxes.push(greenBox)

    if (showDebugBboxes) {
      const edges = new THREE.EdgesGeometry(boxGeometry)
      const edgesMat = new THREE.LineBasicMaterial({ color: 0x66ff66, linewidth: 2 })
      const wireframe = new THREE.LineSegments(edges, edgesMat)
      wireframe.position.copy(greenBox.position)
      ladderContainer.add(wireframe)
      greenCollisionBoxes.push(wireframe)
    }
  }

  // === STEP 6: Create green boxes for sciskane handles D2 (only in attic mode) ===
  if (isAtticMode) {
    for (let i = 0; i < sciskaneHandles2.length; i++) {
      const handle = sciskaneHandles2[i]
      if (handle.hiddenByCollision) continue

      const handleY = (maxHeight / 2) - height2 + handle.offsetFromBottom
      const wspType = handle.wspornikType || defaultWspornik2
      const isLong = wspType === 'sredni' || wspType === 'dlugi'
      const boxH = (isLong ? 215 : 180) * SCALE
      const yOff = isLong ? -18 * SCALE : 0

      // Position Z for ladder 2 (opposite side)
      const wallThickness = 250
      const geoConfig2 = ladderGeometryConfig[2]
      const wallZ2 = geoConfig2.zOffset + globalWspornikDistance2 + (wallThickness / 2) + 33
      const boxZ2 = (wallZ2 - wallThickness / 2 - 100) * SCALE

      const boxGeometry = new THREE.BoxGeometry(120 * SCALE, boxH, 200 * SCALE)
      const sciskaneMaterial = new THREE.MeshBasicMaterial({
        color: 0x66ff66,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      })
      const greenBox = new THREE.Mesh(boxGeometry, sciskaneMaterial)
      greenBox.position.set(0, handleY * SCALE + yOff, boxZ2)
      greenBox.userData.isGreenCollisionBox = true
      greenBox.userData.isSciskaneBox = true
      greenBox.userData.sciskaneIndex = i
      greenBox.userData.wspornikType = wspType
      greenBox.userData.ladderNum = 2
      greenBox.visible = showDebugBboxes

      ladderContainer.add(greenBox)
      greenCollisionBoxes.push(greenBox)

      if (showDebugBboxes) {
        const edges = new THREE.EdgesGeometry(boxGeometry)
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x66ff66, linewidth: 2 })
        const wireframe = new THREE.LineSegments(edges, edgesMat)
        wireframe.position.copy(greenBox.position)
        ladderContainer.add(wireframe)
        greenCollisionBoxes.push(wireframe)
      }
    }
  }
}

// ============================================
// COLLISION DETECTION - Main Function
// ============================================
function checkObstacleCollisions() {
  const previousCollisions = obstacleCollisions.slice()
  obstacleCollisions = []

  const hasObstacles = obstaclesFromConfigurator && obstaclesFromConfigurator.length > 0
  const hasEave = props.eave && props.eave.height > 0
  const isAtticPassage = props.scheme === 'attic-passage'

  // If no obstacles AND no eave AND not attic-passage - restore all auto-changed
  if (!hasObstacles && !hasEave && !isAtticPassage) {
    restoreAutoChangedConnectors(previousCollisions)
    const sciskaneRestored = restoreAllHiddenSciskane()
    if (sciskaneRestored && !isCheckingCollisions) {
      isCheckingCollisions = true
      createLadder()
      isCheckingCollisions = false
    }
    return
  }

  // Find blue collision zones
  const blueZones: THREE.Mesh[] = []
  for (const obj of obstacleObjects) {
    // Skip wall-point obstacles - they don't cause collisions
    if (obj.userData.isWallPoint) continue;
    if (obj.userData?.isCollisionZone && (obj as THREE.Mesh).geometry) {
      blueZones.push(obj as THREE.Mesh)
    }
  }

  // If no green boxes - only check sciskane
  if (greenCollisionBoxes.length === 0) {
    checkSciskaneCollisions(blueZones)
    return
  }

  // Find green boxes
  const greenBoxes: THREE.Mesh[] = []
  for (const box of greenCollisionBoxes) {
    if (box.userData?.isGreenCollisionBox && (box as THREE.Mesh).geometry) {
      greenBoxes.push(box as THREE.Mesh)
    }
  }

  const collidingPairIndices = new Set<number>()

  // Check blue vs green collision (Y axis only)
  for (const blue of blueZones) {
    const blueY = blue.position.y
    const blueHeight = (blue.geometry as THREE.BoxGeometry).parameters.height
    const blueMinY = blueY - blueHeight / 2
    const blueMaxY = blueY + blueHeight / 2

    for (const green of greenBoxes) {
      if (green.userData.isMidRungBox || green.userData.isSciskaneBox) continue  // Handle separately

      const greenY = green.position.y
      const greenHeight = (green.geometry as THREE.BoxGeometry).parameters.height
      const greenMinY = greenY - greenHeight / 2
      const greenMaxY = greenY + greenHeight / 2

      // Check Y overlap
      const intersects = (blueMinY <= greenMaxY) && (blueMaxY >= greenMinY)

      if (intersects) {
        const pairIdx = green.userData.pairIndex
        collidingPairIndices.add(pairIdx)
      }
    }
  }

  obstacleCollisions = Array.from(collidingPairIndices)

  let changesWereMade = false

  // Restore connectors that no longer have collision
  for (const idx of previousCollisions) {
    if (!obstacleCollisions.includes(idx)) {
      const wasChanged = restoreConnectorToUchwyt(idx)
      if (wasChanged) changesWereMade = true
    }
  }

  // Change to lacznik for collisions
  for (const collisionIdx of obstacleCollisions) {
    const wasChanged = autoChangeToLacznik(collisionIdx, blueZones)
    if (wasChanged) changesWereMade = true
  }

  // Check sciskane and midRungBracket collisions
  const sciskaneChanges = checkSciskaneCollisions(blueZones)
  if (sciskaneChanges) changesWereMade = true

  // Rebuild model if changes were made
  if (changesWereMade && !isCheckingCollisions) {
    isCheckingCollisions = true
    createLadder()
    isCheckingCollisions = false
  }

  // Check and emit warning about missing brackets
  checkAndEmitBracketWarning()
}

// ============================================
// AUTO-CHANGE CONNECTOR TO LACZNIK
// ============================================
function autoChangeToLacznik(jointIndex: number, blueZones: THREE.Mesh[]): boolean {
  // Don't change top handrail connector (jointIndex=0) for safety type
  if (handrailType === 'safety' && jointIndex === 0) {
    return false
  }

  // Already a lacznik
  if (connectorTypes1[jointIndex] === 'lacznik') return false

  // Mark as auto-changed
  if (!autoChangedToLacznik.includes(jointIndex)) {
    autoChangedToLacznik.push(jointIndex)
  }

  // Change type
  connectorTypes1[jointIndex] = 'lacznik'

  // Try to add replacement sciskane
  const connPositions = getConnectorPositions()
  if (jointIndex < connPositions.length) {
    const jointY = connPositions[jointIndex]
    const height1 = getTotalHeightForLadder(1)
    const maxHeight = height1  // For single ladder
    const jointOffsetFromBottom = jointY - (maxHeight / 2 - height1)

    // Check if replacement already exists
    const alreadyHasReplacement = sciskaneHandles1.some(
      h => h.isReplacement && h.replacesType === 'joint' && h.replacesJointIndex === jointIndex
    )

    if (!alreadyHasReplacement) {
      const replacementOffset = findAlternativeSciskanePosition(jointOffsetFromBottom, 1, blueZones)
      if (replacementOffset !== null) {
        sciskaneHandles1.push({
          offsetFromBottom: replacementOffset,
          connType: 'sciskany',
          wspornikType: defaultWspornik1,
          wspornikDistance: globalWspornikDistance1,
          isReplacement: true,
          replacesType: 'joint',
          replacesJointIndex: jointIndex,
          originalJointOffset: jointOffsetFromBottom
        })
      }
    }
  }

  return true
}

// ============================================
// RESTORE CONNECTOR TO UCHWYT
// ============================================
function restoreConnectorToUchwyt(jointIndex: number): boolean {
  const autoIdx = autoChangedToLacznik.indexOf(jointIndex)
  if (autoIdx === -1) return false  // Not auto-changed

  // Remove from auto-changed list
  autoChangedToLacznik.splice(autoIdx, 1)

  // Restore to uchwyt
  connectorTypes1[jointIndex] = 'uchwyt'

  // Remove replacement sciskane
  for (let rm = sciskaneHandles1.length - 1; rm >= 0; rm--) {
    const h = sciskaneHandles1[rm]
    if (h.isReplacement && h.replacesType === 'joint' && h.replacesJointIndex === jointIndex) {
      sciskaneHandles1.splice(rm, 1)
      break
    }
  }

  return true
}

function restoreAutoChangedConnectors(collisionIndices: number[]) {
  for (const idx of collisionIndices) {
    restoreConnectorToUchwyt(idx)
  }
}

// ============================================
// GET CONNECTOR POSITIONS
// ============================================
/**
 * Returns array of Y positions (in mm) where connectors are located.
 * Positions are in the order of pairIndex (0 = top, 1 = first section gap, etc.)
 */
function getConnectorPositions(): number[] {
  const positions: number[] = []
  const sections = getLadderSectionsForLadder(1)
  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)

  // Top connector (for safety or attic handrails)
  if ((handrailType === 'safety' || handrailType === 'attic') && sections.length > 0) {
    let topY = (maxHeight / 2) - (DIMS.connectorHeight / 2) - 50
    if (handrailType === 'attic') {
      topY += 100  // offset for attic
    } else {
      topY += 50  // offset for handrail
    }
    positions.push(topY)
  }

  // Between sections
  let currentOffset = 0
  const SECTION_GAP = 3  // 3mm gap between sections

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const sectionHeight = section.type === 'alt' ? getLadderHeight('7alt') : getLadderHeight(section.rungs)
    currentOffset += sectionHeight

    if (i < sections.length - 1) {
      // Connector in the middle of 3mm gap
      const gapCenterOffset = SECTION_GAP / 2
      const connectionY = (maxHeight / 2) - currentOffset - gapCenterOffset + (DIMS.connectorHeight / 2) - 50
      positions.push(connectionY)
      currentOffset += SECTION_GAP
    }
  }

  return positions
}

// ============================================
// CHECK SCISKANE COLLISIONS
// ============================================
function checkSciskaneCollisions(blueZones: THREE.Mesh[]): boolean {
  let changesWereMade = false

  if (blueZones.length === 0) {
    changesWereMade = restoreAllHiddenSciskane()
    return changesWereMade
  }

  const height1 = getTotalHeightForLadder(1)
  const maxHeight = height1

  // === MidRungBracket D1 collision check ===
  if (midRungBracket1 && handrailType !== 'attic') {
    const midRungY = (maxHeight / 2) - 548.5
    const wspType = midRungBracketWspornikType1
    const boxHalfH = (wspType === 'sredni' || wspType === 'dlugi') ? 93.5 : 75
    const yOffset = (wspType === 'sredni' || wspType === 'dlugi') ? -18 : 0
    const handleMinY = midRungY + yOffset - boxHalfH
    const handleMaxY = midRungY + yOffset + boxHalfH

    const collides = checkYRangeCollision(blueZones, handleMinY, handleMaxY)
    const midRungOffsetFromBottom = height1 - 548.5

    if (collides && !hiddenMidRungBracket1) {
      hiddenMidRungBracket1 = true
      changesWereMade = true

      // Try to add replacement sciskane
      const alreadyHasMidRungReplacement = sciskaneHandles1.some(
        h => h.isReplacement && h.replacesType === 'midRungBracket'
      )
      if (!alreadyHasMidRungReplacement) {
        const replacementOffset = findAlternativeSciskanePosition(midRungOffsetFromBottom, 1, blueZones)
        if (replacementOffset !== null) {
          sciskaneHandles1.push({
            offsetFromBottom: replacementOffset,
            connType: 'sciskany',
            wspornikType: midRungBracketWspornikType1,
            wspornikDistance: midRungBracketDistance1,
            isReplacement: true,
            replacesType: 'midRungBracket',
            originalMidRungOffset: midRungOffsetFromBottom
          })
        }
      }
    } else if (!collides && hiddenMidRungBracket1) {
      hiddenMidRungBracket1 = false
      changesWereMade = true

      // Remove replacement sciskane
      for (let rm = sciskaneHandles1.length - 1; rm >= 0; rm--) {
        if (sciskaneHandles1[rm].isReplacement && sciskaneHandles1[rm].replacesType === 'midRungBracket') {
          sciskaneHandles1.splice(rm, 1)
          break
        }
      }
    }
  }

  // === Sciskane handles D1 collision check ===
  for (let i = sciskaneHandles1.length - 1; i >= 0; i--) {
    const handle = sciskaneHandles1[i]

    // Skip replacement handles
    if (handle.isReplacement) continue

    const originalOffset = handle.originalOffsetFromBottom || handle.offsetFromBottom
    const handleY = (maxHeight / 2) - height1 + handle.offsetFromBottom
    const wspType = handle.wspornikType || defaultWspornik1
    const boxHalfH = (wspType === 'sredni' || wspType === 'dlugi') ? 93.5 : 75
    const yOffset = (wspType === 'sredni' || wspType === 'dlugi') ? -18 : 0
    const handleMinY = handleY + yOffset - boxHalfH
    const handleMaxY = handleY + yOffset + boxHalfH

    const collides = checkYRangeCollision(blueZones, handleMinY, handleMaxY)

    if (collides) {
      // Count currently relocated (max 1)
      const currentRelocatedCount = sciskaneHandles1.filter(
        (h, idx) => idx !== i && h.wasRelocated
      ).length
      const canRelocate = currentRelocatedCount < 1

      let alternativeOffset: number | null = null
      if (canRelocate) {
        alternativeOffset = findAlternativeSciskanePosition(originalOffset, 1, blueZones, handle.offsetFromBottom)
      }

      if (alternativeOffset !== null) {
        // Relocate handle
        handle.originalOffsetFromBottom = originalOffset
        handle.offsetFromBottom = alternativeOffset
        handle.wasRelocated = true
        relocatedSciskaneHandles1.push({
          originalOffset,
          newOffset: alternativeOffset
        })
        changesWereMade = true
      } else {
        // Hide handle
        const alreadyHidden = hiddenSciskaneHandles1.some(
          h => h.offsetFromBottom === originalOffset || h.originalOffsetFromBottom === originalOffset
        )
        if (!alreadyHidden) {
          const hidden = sciskaneHandles1.splice(i, 1)[0]
          hidden.hiddenByCollision = true
          hidden.originalOffsetFromBottom = originalOffset
          hiddenSciskaneHandles1.push(hidden)
          changesWereMade = true
        }
      }
    }
  }

  // Check relocated - restore to original if no longer collides
  for (let k = sciskaneHandles1.length - 1; k >= 0; k--) {
    const handle = sciskaneHandles1[k]
    if (handle.wasRelocated && handle.originalOffsetFromBottom !== undefined) {
      const origY = (maxHeight / 2) - height1 + handle.originalOffsetFromBottom
      const wspType = handle.wspornikType || defaultWspornik1
      const boxHalfH = (wspType === 'sredni' || wspType === 'dlugi') ? 93.5 : 75
      const yOffset = (wspType === 'sredni' || wspType === 'dlugi') ? -18 : 0
      const origMinY = origY + yOffset - boxHalfH
      const origMaxY = origY + yOffset + boxHalfH

      const originalStillCollides = checkYRangeCollision(blueZones, origMinY, origMaxY)

      if (!originalStillCollides) {
        const origOffset = handle.originalOffsetFromBottom
        handle.offsetFromBottom = origOffset
        delete handle.originalOffsetFromBottom
        delete handle.wasRelocated

        // Remove from relocated array
        const relIdx = relocatedSciskaneHandles1.findIndex(r => r.originalOffset === origOffset)
        if (relIdx !== -1) {
          relocatedSciskaneHandles1.splice(relIdx, 1)
        }
        changesWereMade = true
      }
    }
  }

  // Check hidden - restore if no longer collides
  for (let j = hiddenSciskaneHandles1.length - 1; j >= 0; j--) {
    const hidden = hiddenSciskaneHandles1[j]
    const origOffset = hidden.originalOffsetFromBottom || hidden.offsetFromBottom
    const handleY = (maxHeight / 2) - height1 + origOffset
    const wspType = hidden.wspornikType || defaultWspornik1
    const boxHalfH = (wspType === 'sredni' || wspType === 'dlugi') ? 93.5 : 75
    const yOffset = (wspType === 'sredni' || wspType === 'dlugi') ? -18 : 0
    const handleMinY = handleY + yOffset - boxHalfH
    const handleMaxY = handleY + yOffset + boxHalfH

    const stillCollides = checkYRangeCollision(blueZones, handleMinY, handleMaxY)

    if (!stillCollides) {
      const restored = hiddenSciskaneHandles1.splice(j, 1)[0]
      sciskaneHandles1.push({
        offsetFromBottom: origOffset,
        connType: restored.connType || 'sciskany',
        wspornikType: restored.wspornikType || defaultWspornik1,
        wspornikDistance: restored.wspornikDistance || globalWspornikDistance1,
        autoAdded: restored.autoAdded,
        isReplacement: restored.isReplacement,
        replacesType: restored.replacesType,
        replacesJointIndex: restored.replacesJointIndex,
        originalJointOffset: restored.originalJointOffset,
        originalMidRungOffset: restored.originalMidRungOffset
      })
      changesWereMade = true
    }
  }

  // === CHECK REPLACEMENT HANDLES FOR COLLISION AND ORIGINAL POSITION RESTORATION ===
  // Replacement handles should be checked for:
  // 1. If original position is free - restore original and remove replacement
  // 2. If a CLOSER position to original is free - move there
  // 3. If replacement collides - try to find new position or remove
  for (let r = sciskaneHandles1.length - 1; r >= 0; r--) {
    const handle = sciskaneHandles1[r]
    if (!handle.isReplacement) continue

    const wspType = handle.wspornikType || defaultWspornik1
    const boxHalfH = (wspType === 'sredni' || wspType === 'dlugi') ? 93.5 : 75
    const yOffset = (wspType === 'sredni' || wspType === 'dlugi') ? -18 : 0
    const rungSpacing = DIMS.rungSpacing  // 275mm

    // === FIRST: Check if original position is now free ===
    const originalOffset = handle.originalJointOffset || handle.originalMidRungOffset || handle.offsetFromBottom
    const originalY = (maxHeight / 2) - height1 + originalOffset
    const originalMinY = originalY + yOffset - boxHalfH
    const originalMaxY = originalY + yOffset + boxHalfH
    const originalStillCollides = checkYRangeCollision(blueZones, originalMinY, originalMaxY)

    if (!originalStillCollides) {
      // Original position is free! Restore original and remove replacement
      if (handle.replacesType === 'joint' && handle.replacesJointIndex !== undefined) {
        // Restore joint connector to uchwyt
        restoreConnectorToUchwyt(handle.replacesJointIndex)
        changesWereMade = true
        continue  // Handle was removed by restoreConnectorToUchwyt
      } else if (handle.replacesType === 'midRungBracket') {
        // Restore midRungBracket
        hiddenMidRungBracket1 = false
        sciskaneHandles1.splice(r, 1)
        changesWereMade = true
        continue
      }
    }

    // === SECOND: Check if a CLOSER position to original is now free ===
    // Priority: +1 rung, -1 rung, -2 rungs, +2 rungs (closest first)
    const currentDistanceFromOriginal = Math.abs(handle.offsetFromBottom - originalOffset)
    const positionsToCheck = [
      { offset: originalOffset + rungSpacing, distance: rungSpacing },       // +1
      { offset: originalOffset - rungSpacing, distance: rungSpacing },       // -1
      { offset: originalOffset - 2 * rungSpacing, distance: 2 * rungSpacing }, // -2
      { offset: originalOffset + 2 * rungSpacing, distance: 2 * rungSpacing }  // +2
    ]

    for (const pos of positionsToCheck) {
      // Only check positions that are CLOSER than current
      if (pos.distance >= currentDistanceFromOriginal) continue
      // Skip if this is the current position
      if (Math.abs(pos.offset - handle.offsetFromBottom) < 10) continue

      // Check bounds
      if (pos.offset < 100 || pos.offset > height1 - 100) continue

      // Check collision
      const posY = (maxHeight / 2) - height1 + pos.offset
      const posMinY = posY + yOffset - boxHalfH
      const posMaxY = posY + yOffset + boxHalfH
      if (checkYRangeCollision(blueZones, posMinY, posMaxY)) continue

      // Check if valid (not too close to connectors/other handles)
      if (!isPositionValidForSciskane(posY, 1)) continue

      // Check if another handle exists at this position
      let alreadyExists = false
      for (const h of sciskaneHandles1) {
        if (h === handle) continue
        if (Math.abs(h.offsetFromBottom - pos.offset) < 50) {
          alreadyExists = true
          break
        }
      }
      if (alreadyExists) continue

      // Found a closer free position - move there!
      handle.offsetFromBottom = pos.offset
      changesWereMade = true
      break
    }

    // === THIRD: Check if current replacement position collides ===
    const handleY = (maxHeight / 2) - height1 + handle.offsetFromBottom
    const handleMinY = handleY + yOffset - boxHalfH
    const handleMaxY = handleY + yOffset + boxHalfH
    const collides = checkYRangeCollision(blueZones, handleMinY, handleMaxY)

    if (collides) {
      // Current position collides - try to find a new position
      const newPosition = findAlternativeSciskanePosition(originalOffset, 1, blueZones, handle.offsetFromBottom)

      if (newPosition !== null && newPosition !== handle.offsetFromBottom) {
        // Move replacement to new position
        handle.offsetFromBottom = newPosition
        changesWereMade = true
      } else {
        // No safe position found - remove replacement
        sciskaneHandles1.splice(r, 1)
        changesWereMade = true
      }
    }
  }

  // === TRY TO ADD MISSING REPLACEMENTS ===
  // For joints that were changed to lacznik but don't have a replacement - try to add one
  const connPositions = getConnectorPositions()
  for (const jointIndex of autoChangedToLacznik) {
    // Check if replacement already exists for this joint
    const hasReplacement = sciskaneHandles1.some(
      h => h.isReplacement && h.replacesType === 'joint' && h.replacesJointIndex === jointIndex
    )

    if (!hasReplacement && jointIndex < connPositions.length) {
      const jointY = connPositions[jointIndex]
      const jointOffsetFromBottom = jointY - (maxHeight / 2 - height1)

      const replacementOffset = findAlternativeSciskanePosition(jointOffsetFromBottom, 1, blueZones)
      if (replacementOffset !== null) {
        sciskaneHandles1.push({
          offsetFromBottom: replacementOffset,
          connType: 'sciskany',
          wspornikType: defaultWspornik1,
          wspornikDistance: globalWspornikDistance1,
          isReplacement: true,
          replacesType: 'joint',
          replacesJointIndex: jointIndex,
          originalJointOffset: jointOffsetFromBottom
        })
        changesWereMade = true
      }
    }
  }

  // For hidden midRungBracket without replacement - try to add one
  if (hiddenMidRungBracket1 && handrailType !== 'attic') {
    const hasReplacement = sciskaneHandles1.some(
      h => h.isReplacement && h.replacesType === 'midRungBracket'
    )

    if (!hasReplacement) {
      const midRungOffsetFromBottom = height1 - 548.5
      const replacementOffset = findAlternativeSciskanePosition(midRungOffsetFromBottom, 1, blueZones)
      if (replacementOffset !== null) {
        sciskaneHandles1.push({
          offsetFromBottom: replacementOffset,
          connType: 'sciskany',
          wspornikType: midRungBracketWspornikType1,
          wspornikDistance: midRungBracketDistance1,
          isReplacement: true,
          replacesType: 'midRungBracket',
          originalMidRungOffset: midRungOffsetFromBottom
        })
        changesWereMade = true
      }
    }
  }

  return changesWereMade
}

// ============================================
// CHECK Y RANGE COLLISION
// ============================================
function checkYRangeCollision(blueZones: THREE.Mesh[], minY: number, maxY: number): boolean {
  for (const blue of blueZones) {
    const blueY = blue.position.y / SCALE
    const blueHalfH = ((blue.geometry as THREE.BoxGeometry).parameters.height / SCALE) / 2
    const blueMinY = blueY - blueHalfH
    const blueMaxY = blueY + blueHalfH

    // Check Y overlap
    if (minY <= blueMaxY && maxY >= blueMinY) {
      return true
    }
  }
  return false
}

// ============================================
// FIND ALTERNATIVE SCISKANE POSITION
// ============================================
function findAlternativeSciskanePosition(
  originalOffsetFromBottom: number,
  ladderNum: number,
  blueZones: THREE.Mesh[],
  currentOffset?: number
): number | null {
  const rungSpacing = DIMS.rungSpacing  // 275mm
  const ladderTotalHeight = getTotalHeightForLadder(ladderNum)
  const height1 = getTotalHeightForLadder(1)
  const maxHeight = height1
  const wspType = ladderNum === 1 ? defaultWspornik1 : defaultWspornik2
  const boxHalfH = (wspType === 'sredni' || wspType === 'dlugi') ? 93.5 : 75
  const yOffset = (wspType === 'sredni' || wspType === 'dlugi') ? -18 : 0

  // Positions to check: 1 UP → 1 DOWN → 2 DOWN → 2 UP (user-requested priority)
  const offsets = [rungSpacing, -rungSpacing, -2 * rungSpacing, 2 * rungSpacing]

  for (const offset of offsets) {
    const newOffset = originalOffsetFromBottom + offset

    // Check within ladder bounds (100mm margin)
    if (newOffset < 100 || newOffset > ladderTotalHeight - 100) {
      continue
    }

    // Calculate Y in scene coordinates
    const newY = (maxHeight / 2) - ladderTotalHeight + newOffset

    // Check collision with obstacles
    const handleMinY = newY + yOffset - boxHalfH
    const handleMaxY = newY + yOffset + boxHalfH
    if (checkYRangeCollision(blueZones, handleMinY, handleMaxY)) {
      continue  // Collides with obstacle
    }

    // Check if position is valid (not too close to other handles/connectors)
    if (!isPositionValidForSciskane(newY, ladderNum)) {
      continue
    }

    // Check if handle already exists at this position
    const currentHandles = ladderNum === 1 ? sciskaneHandles1 : sciskaneHandles2
    let alreadyExists = false
    for (const h of currentHandles) {
      const handleOffset = h.offsetFromBottom
      // Ignore the handle being relocated
      if (currentOffset !== undefined && Math.abs(handleOffset - currentOffset) < 10) {
        continue
      }
      if (Math.abs(handleOffset - newOffset) < 50) {
        alreadyExists = true
        break
      }
    }
    if (alreadyExists) continue

    // Found valid position!
    return newOffset
  }

  return null
}

// ============================================
// RESTORE ALL HIDDEN SCISKANE
// ============================================
function restoreAllHiddenSciskane(): boolean {
  let anyRestored = false

  // Remove all relocated handles
  for (const handle of sciskaneHandles1) {
    if (handle.wasRelocated && handle.originalOffsetFromBottom !== undefined) {
      handle.offsetFromBottom = handle.originalOffsetFromBottom
      delete handle.originalOffsetFromBottom
      delete handle.wasRelocated
      anyRestored = true
    }
  }
  relocatedSciskaneHandles1 = []

  // Restore midRungBracket
  if (hiddenMidRungBracket1) {
    hiddenMidRungBracket1 = false
    anyRestored = true

    // Remove replacement sciskane for midRungBracket
    for (let rm = sciskaneHandles1.length - 1; rm >= 0; rm--) {
      if (sciskaneHandles1[rm].isReplacement && sciskaneHandles1[rm].replacesType === 'midRungBracket') {
        sciskaneHandles1.splice(rm, 1)
      }
    }
  }

  // Restore hidden sciskane handles
  while (hiddenSciskaneHandles1.length > 0) {
    const restored = hiddenSciskaneHandles1.pop()!
    const offsetToRestore = restored.originalOffsetFromBottom !== undefined
      ? restored.originalOffsetFromBottom
      : restored.offsetFromBottom

    sciskaneHandles1.push({
      offsetFromBottom: offsetToRestore,
      connType: restored.connType || 'sciskany',
      wspornikType: restored.wspornikType || defaultWspornik1,
      wspornikDistance: restored.wspornikDistance || globalWspornikDistance1,
      autoAdded: restored.autoAdded,
      isReplacement: restored.isReplacement,
      replacesType: restored.replacesType,
      replacesJointIndex: restored.replacesJointIndex,
      originalJointOffset: restored.originalJointOffset,
      originalMidRungOffset: restored.originalMidRungOffset
    })
    anyRestored = true
  }

  return anyRestored
}

// ============================================
// BRACKET COUNTING FOR COLLISION WARNINGS
// ============================================
/**
 * Calculate expected number of wall mounting brackets (without any collisions)
 * Includes: midRungBracket + connectors with wspornik + sciskane handles
 */
function calculateExpectedBracketCount(ladderNum: number): number {
  let count = 0

  // midRungBracket (always count if enabled - should exist)
  const midRungEnabled = (ladderNum === 1) ? midRungBracket1 : midRungBracket2
  if (midRungEnabled && handrailType !== 'attic') {
    count++
  }

  // Connectors of type 'uchwyt' (have wspornik)
  // For expected count, we count ALL connector positions (before collision changes)
  const sections = getLadderSectionsForLadder(ladderNum)
  const numConnectorPairs = sections.length  // Top connector + between-section connectors

  // For safety handrail, pairIndex=0 is handrail mount (no wspornik counted)
  const startIdx = (handrailType === 'safety') ? 1 : 0
  for (let i = startIdx; i < numConnectorPairs; i++) {
    count++
  }

  // Sciskane handles (non-replacement, non-auto-added)
  const handles = (ladderNum === 1) ? sciskaneHandles1 : sciskaneHandles2
  for (const h of handles) {
    if (!h.isReplacement && !h.autoAdded) {
      count++
    }
  }

  // Auto-added sciskane for final ladders X4-X7
  const finalRungs = (ladderNum === 1) ? finalLadderRungs1 : finalLadderRungs2
  if (finalRungs === 4 || finalRungs === 5 || finalRungs === 6 || finalRungs === 7 || finalRungs === '7alt') {
    count++
  }

  return count
}

/**
 * Calculate actual number of wall mounting brackets (after collision changes)
 */
function calculateActualBracketCount(ladderNum: number): number {
  let count = 0

  // midRungBracket (only if not hidden)
  const midRungEnabled = (ladderNum === 1) ? midRungBracket1 : midRungBracket2
  const midRungHidden = (ladderNum === 1) ? hiddenMidRungBracket1 : false
  if (midRungEnabled && handrailType !== 'attic' && !midRungHidden) {
    count++
  }

  // Connectors of type 'uchwyt' (have wspornik) - only non-lacznik
  const connTypes = (ladderNum === 1) ? connectorTypes1 : connectorTypes2
  const startIdx = (handrailType === 'safety') ? 1 : 0
  for (let i = startIdx; i < connTypes.length; i++) {
    if (connTypes[i] !== 'lacznik') {
      count++
    }
  }

  // Sciskane handles that are actually rendered (not hidden)
  const handles = (ladderNum === 1) ? sciskaneHandles1 : sciskaneHandles2
  for (const h of handles) {
    if (!h.hiddenByCollision) {
      count++
    }
  }

  return count
}

/**
 * Track bracket count and emit warning if brackets are missing
 */
function checkAndEmitBracketWarning(): void {
  const expected = calculateExpectedBracketCount(1)
  const actual = calculateActualBracketCount(1)
  const missing = expected - actual

  if (missing > 0) {
    emit('collisionWarning', {
      expectedBrackets: expected,
      actualBrackets: actual,
      missingBrackets: missing,
      message: `Nie można wstawić wszystkich uchwytów. Przewidziana liczba: ${expected}, aktualna: ${actual}. Brakuje: ${missing} uchwyt${missing === 1 ? '' : missing < 5 ? 'y' : 'ów'}.`
    })
  } else {
    // Clear warning if no missing brackets
    emit('collisionWarning', {
      expectedBrackets: expected,
      actualBrackets: actual,
      missingBrackets: 0,
      message: ''
    })
  }
}

// ============================================
// RENDER SCISKANE HANDLES
// ============================================
function renderSciskaneHandles() {
  // Clear existing placed objects
  sciskanePlacedObjects = []

  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)

  // Render for ladder 1
  for (const handle of sciskaneHandles1) {
    const yPos = (maxHeight / 2) - (height1 - handle.offsetFromBottom)
    const geoConfig = ladderGeometryConfig[1]
    const connType = handle.connType || 'sciskany'

    // Left handle
    const leftConn = createConnector(connType, 'left', 1, false)
    leftConn.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
    leftConn.position.y = yPos * SCALE
    leftConn.position.z = (geoConfig.sciskane.leftZOffset + geoConfig.zOffset) * SCALE
    leftConn.userData.isSciskaneHandle = true
    leftConn.userData.isSciskanePlaced = true
    leftConn.userData.offsetFromBottom = handle.offsetFromBottom
    leftConn.userData.ladderNum = 1
    ladderContainer.add(leftConn)
    sciskanePlacedObjects.push(leftConn)

    // Right handle
    const rightConn = createConnector(connType, 'right', 1, false)
    rightConn.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
    rightConn.position.y = yPos * SCALE
    rightConn.position.z = (geoConfig.sciskane.rightZOffset + geoConfig.zOffset) * SCALE
    rightConn.userData.isSciskaneHandle = true
    rightConn.userData.isSciskanePlaced = true
    rightConn.userData.offsetFromBottom = handle.offsetFromBottom
    rightConn.userData.ladderNum = 1
    ladderContainer.add(rightConn)
    sciskanePlacedObjects.push(rightConn)

    // Wsporniki for sciskane
    if (handle.wspornikType && handle.wspornikType !== 'none') {
      // Rodzine rozstrzygamy w jednym miejscu - patrz typWspornikaUchwytu()
      const typUchwytu = typWspornikaUchwytu(handle, 1)
      const customDistance = handle.wspornikDistance || wspornikDefaultDistances[typUchwytu]
      const defaultDist = wspornikDefaultDistances[typUchwytu]
      const distanceOffset = customDistance - defaultDist
      const distanceZOffset = -distanceOffset

      const leftWsp = createWspornik(typUchwytu, 'left', 1, false)
      if (leftWsp) {
        leftWsp.position.x = (-RAIL_OFFSET + leftWsp.userData.extraXOffset) * SCALE
        leftWsp.position.y = (yPos + leftWsp.userData.extraYOffset) * SCALE
        leftWsp.position.z = (geoConfig.wspornik.zOffset + geoConfig.zOffset + leftWsp.userData.extraZOffset + distanceZOffset) * SCALE
        leftWsp.userData.isSciskaneWspornik = true
        leftWsp.userData.isSciskanePlaced = true
        leftWsp.userData.offsetFromBottom = handle.offsetFromBottom
        leftWsp.userData.ladderNum = 1
        ladderContainer.add(leftWsp)
        sciskanePlacedObjects.push(leftWsp)
      }

      const rightWsp = createWspornik(typUchwytu, 'right', 1, false)
      if (rightWsp) {
        rightWsp.position.x = (RAIL_OFFSET - rightWsp.userData.extraXOffset) * SCALE
        rightWsp.position.y = (yPos + rightWsp.userData.extraYOffset) * SCALE
        rightWsp.position.z = (geoConfig.wspornik.zOffset + geoConfig.zOffset + rightWsp.userData.extraZOffset + distanceZOffset) * SCALE
        rightWsp.userData.isSciskaneWspornik = true
        rightWsp.userData.isSciskanePlaced = true
        rightWsp.userData.offsetFromBottom = handle.offsetFromBottom
        rightWsp.userData.ladderNum = 1
        ladderContainer.add(rightWsp)
        sciskanePlacedObjects.push(rightWsp)
      }
    }
  }

  // Render for ladder 2 (attic mode or brackets mode)
  const shouldRenderLadder2Handles = handrailType === 'attic' || (props.descentMountType === 'brackets' && props.descentLadder)
  if (shouldRenderLadder2Handles) {
    // Use correct Z base position depending on mode
    const isBracketsMode = props.descentMountType === 'brackets' && props.descentLadder
    const baseZForLadder2 = isBracketsMode ? descentLadderZPosition : ladderGeometryConfig[2].zOffset

    for (const handle of sciskaneHandles2) {
      const yPos = (maxHeight / 2) - (height2 - handle.offsetFromBottom)
      const geoConfig = ladderGeometryConfig[2]
      const connType = handle.connType || 'sciskany'

      const leftConn = createConnector(connType, 'left', 2, false)
      leftConn.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
      leftConn.position.y = yPos * SCALE
      leftConn.position.z = (geoConfig.sciskane.leftZOffset + baseZForLadder2) * SCALE
      leftConn.userData.isSciskaneHandle = true
      leftConn.userData.isSciskanePlaced = true
      leftConn.userData.offsetFromBottom = handle.offsetFromBottom
      leftConn.userData.ladderNum = 2
      ladderContainer.add(leftConn)
      sciskanePlacedObjects.push(leftConn)

      const rightConn = createConnector(connType, 'right', 2, false)
      rightConn.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
      rightConn.position.y = yPos * SCALE
      rightConn.position.z = (geoConfig.sciskane.rightZOffset + baseZForLadder2) * SCALE
      rightConn.userData.isSciskaneHandle = true
      rightConn.userData.isSciskanePlaced = true
      rightConn.userData.offsetFromBottom = handle.offsetFromBottom
      rightConn.userData.ladderNum = 2
      ladderContainer.add(rightConn)
      sciskanePlacedObjects.push(rightConn)

      // Wsporniki for sciskane handles on ladder 2
      if (handle.wspornikType && handle.wspornikType !== 'none') {
        // Rodzine rozstrzygamy w jednym miejscu - patrz typWspornikaUchwytu()
        const typUchwytu = typWspornikaUchwytu(handle, 2)
        const customDistance = handle.wspornikDistance || wspornikDefaultDistances[typUchwytu]
        const defaultDist = wspornikDefaultDistances[typUchwytu]
        const distanceOffset = customDistance - defaultDist
        const distanceZOffset = distanceOffset  // Positive for ladder 2 (opposite direction)

        const leftWsp = createWspornik(typUchwytu, 'left', 2, false)
        if (leftWsp) {
          leftWsp.position.x = (-RAIL_OFFSET + leftWsp.userData.extraXOffset) * SCALE
          leftWsp.position.y = (yPos + leftWsp.userData.extraYOffset) * SCALE
          leftWsp.position.z = (geoConfig.wspornik.zOffset + baseZForLadder2 + leftWsp.userData.extraZOffset + distanceZOffset) * SCALE
          leftWsp.userData.isSciskaneWspornik = true
          leftWsp.userData.isSciskanePlaced = true
          leftWsp.userData.offsetFromBottom = handle.offsetFromBottom
          leftWsp.userData.ladderNum = 2
          ladderContainer.add(leftWsp)
          sciskanePlacedObjects.push(leftWsp)
        }

        const rightWsp = createWspornik(typUchwytu, 'right', 2, false)
        if (rightWsp) {
          rightWsp.position.x = (RAIL_OFFSET - rightWsp.userData.extraXOffset) * SCALE
          rightWsp.position.y = (yPos + rightWsp.userData.extraYOffset) * SCALE
          rightWsp.position.z = (geoConfig.wspornik.zOffset + baseZForLadder2 + rightWsp.userData.extraZOffset + distanceZOffset) * SCALE
          rightWsp.userData.isSciskaneWspornik = true
          rightWsp.userData.isSciskanePlaced = true
          rightWsp.userData.offsetFromBottom = handle.offsetFromBottom
          rightWsp.userData.ladderNum = 2
          ladderContainer.add(rightWsp)
          sciskanePlacedObjects.push(rightWsp)
        }
      }
    }
  }
}

// ============================================
// MAIN CREATE LADDER FUNCTION
// ============================================
function createLadder() {
  // Clear hidden elements on full rebuild (configuration change)
  // This resets the "deleted" elements when user changes configuration
  clearHiddenElements()

  // Temporarily disable outlines for performance during rebuild
  if (outlineDelayTimer) {
    clearTimeout(outlineDelayTimer)
    outlineDelayTimer = null
  }
  outlineEnabled = false

  // Clear previous ladder (keep camera state!)
  while (ladderContainer.children.length > 0) {
    ladderContainer.remove(ladderContainer.children[0])
  }

  connectorObjects = []
  wspornikObjects = []

  // Reset pozycji boxów mierzenia
  roofTopBoxY = null
  finalLadderBottomBoxY = null
  lastFinalLadderBottomY = null
  savedYellowBoxData = null
  groundTopBoxY = null
  handrailTopBoxY = null

  // Determine which ladders to render
  const laddersToRender = [1]
  // Only add ladder 2 to laddersToRender for attic mode when NOT using brackets
  // (brackets mode uses renderDescentLadderConnectors instead of renderConnectorsForLadder)
  if (handrailType === 'attic' && props.descentMountType !== 'brackets') {
    laddersToRender.push(2)
  }

  // Calculate heights
  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)
  const totalHeight = maxHeight

  // Render ladder sections for each ladder
  for (const ladderNum of laddersToRender) {
    const geoConfig = ladderGeometryConfig[ladderNum]
    const ladderSections = getLadderSectionsForLadder(ladderNum)

    let currentHeightOffset = 2  // 2mm gap (podniesione o 1mm) between handrails/platform and first ladder section

    for (let s = 0; s < ladderSections.length; s++) {
      const section = ladderSections[s]
      const sectionHeight = section.type === 'alt' ? getLadderHeight('7alt') : getLadderHeight(section.rungs)

      let sourceModel: THREE.Group | null = null

      if (section.type === 'standard' && loadedModels.powielana) {
        sourceModel = loadedModels.powielana
      } else if (section.type === 'alt' && loadedModels.koncowa[7]) {
        sourceModel = loadedModels.koncowa[7]
      } else if (section.type === 'final' && loadedModels.koncowa[section.rungs]) {
        sourceModel = loadedModels.koncowa[section.rungs]
      }

      if (sourceModel) {
        const model = sourceModel.clone(true)
        model.rotation.x = Math.PI * 1.5
        model.rotation.z = geoConfig.rotationZ
        model.scale.set(SCALE, SCALE, SCALE)

        const yPos = (maxHeight / 2) - currentHeightOffset - (sectionHeight / 2) + (section.type === 'final' ? (section.rungs === 7 ? 48 : -1) : 0)
        model.position.y = yPos * SCALE
        model.position.z = geoConfig.zOffset * SCALE
        model.userData.ladderNum = ladderNum
        model.userData.isLadderModule = true
        model.userData.rungs = section.rungs
        model.userData.moduleType = section.type // 'standard', 'alt', 'final'
        const ladderModuleElementId = `ladder_module_${ladderNum}_${s}`
        model.userData.elementId = ladderModuleElementId
        model.traverse((child) => {
          child.userData.isLadderModule = true
          child.userData.ladderNum = ladderNum
          child.userData.rungs = section.rungs
          child.userData.elementId = ladderModuleElementId
        })

        addOutlineToModel(model)
        ladderContainer.add(model)

        // Zapisz dół drabiny końcowej (dla boxa mierzenia - box tworzony później w renderYellowMeasurementBox)
        if (section.type === 'final' && ladderNum === 1) {
          const ladderBottomY = yPos - sectionHeight / 2
          const rungs = section.rungs
          const bottomOffset = (rungs === 7 || String(rungs) === '7alt') ? 22 : 26
          // Zapisz pozycję dla żółtego boxa (będzie tworzony po clearMeasurementBoxes)
          const boxYPos = (ladderBottomY - bottomOffset) * SCALE
          const boxSize = 50 * SCALE
          // Zapisz najniższą pozycję
          if (lastFinalLadderBottomY === null || ladderBottomY < lastFinalLadderBottomY) {
            lastFinalLadderBottomY = ladderBottomY
          }
          // Zapisz górę żółtego boxa dla wymiaru Dł. Drabiny
          const yellowBoxTop = boxYPos + boxSize / 2
          if (finalLadderBottomBoxY === null || yellowBoxTop < finalLadderBottomBoxY) {
            finalLadderBottomBoxY = yellowBoxTop
            // Zapisz dane do późniejszego utworzenia boxa
            savedYellowBoxData = {
              boxYPos,
              boxSize,
              boxZOffset: (geoConfig.zOffset + 241) * SCALE,
              ladderNum,
              sectionIndex: s
            }
          }
        }
      }

      currentHeightOffset += sectionHeight
      if (s < ladderSections.length - 1) {
        currentHeightOffset += 3  // 3mm gap
      }
    }
  }

  // Add handrails or attic passage
  if (handrailType === 'safety' && totalHeight > 0 && hasHandrailsLocal) {
    renderSafetyHandrails(totalHeight)
  } else if (handrailType === 'platform' && totalHeight > 0) {
    renderPlatformHandrails(totalHeight, hasHandrailsLocal)
  } else if (handrailType === 'attic' && (height1 > 0 || height2 > 0)) {
    renderAtticPassage(totalHeight)
  }

  // Add connectors and wsporniki for each ladder
  for (const connLadderNum of laddersToRender) {
    renderConnectorsForLadder(connLadderNum, maxHeight)
  }

  // Render mid-rung brackets (only for non-attic)
  if (handrailType !== 'attic') {
    renderMidRungBrackets(laddersToRender, maxHeight)
  }

  // Render sciskane handles
  renderSciskaneHandles()

  // Render safety cage
  if (safetyCageCount1 > 0 || safetyCageCount2 > 0) {
    renderSafetyCage()
  }

  // Create yellow measurement box (after clearMeasurementBoxes in renderSafetyCage)
  renderYellowMeasurementBox()

  // Render wall and ground
  if (height1 > 0 && wallHeightConfig > 0) {
    renderWallAndGround(height1, maxHeight)

    // Rysuj wymiar Dł. Drabiny tylko dla klasycznej/z podestem (nie attyka)
    const isAtticPassage = props.scheme === 'attic-passage'
    // Offset dla wymiarów z tyłu - bazowany na odległości wsporników
    const backOffset = (props.wspornikDistance || 0) * SCALE
    // Dla attyki: gdy nie ma kosza, przesuń wymiary 1200mm do tyłu
    const noCageBackOffset = (!safetyCageCount1 || safetyCageCount1 === 0) ? 1200 * SCALE : 0

    if (roofTopBoxY !== null && finalLadderBottomBoxY !== null) {
      const geoConfig1 = ladderGeometryConfig[1]
      if (isAtticPassage) {
        // Attyka: wymiar z przodu (jak wymiar kosza), do tyłu gdy brak kosza
        const boxZOffset = 334 * SCALE
        const zPos = (geoConfig1.zOffset + 241) * SCALE + boxZOffset - noCageBackOffset
        drawLadderLengthDimension(zPos, true)
      } else {
        // Klasyczna/podest: wymiar z tyłu
        const zPos = (geoConfig1.zOffset + 241) * SCALE - backOffset
        drawLadderLengthDimension(zPos, false)
      }
    }

    // Rysuj wymiar Wys. z poręczami (zielony → pomarańczowy) gdy są poręcze
    if (roofTopBoxY !== null && handrailTopBoxY !== null) {
      const geoConfig1 = ladderGeometryConfig[1]
      if (isAtticPassage) {
        // Attyka: wymiar z przodu, do tyłu gdy brak kosza
        const boxZOffset = 334 * SCALE
        const zPos = (geoConfig1.zOffset + 241) * SCALE + boxZOffset - noCageBackOffset
        drawHandrailHeightDimension(zPos, true)
      } else {
        // Klasyczna/podest: wymiar z tyłu
        const zPos = (geoConfig1.zOffset + 241) * SCALE - backOffset
        drawHandrailHeightDimension(zPos, false)
      }
    }

    // Rysuj wymiar Wys. Kosza (cyan → podłoga) gdy jest kosz
    if (safetyCageCount1 > 0 && lastHoopBoxY !== null && groundTopBoxY !== null) {
      const geoConfig1 = ladderGeometryConfig[1]
      const boxZOffset = 334 * SCALE  // Ten sam offset co wymiar kosza
      const zPos = (geoConfig1.zOffset + 241) * SCALE + boxZOffset
      drawCageHeightDimension(zPos)
    } else {
      // Wyczyść wymiar gdy nie ma kosza
      clearCageHeightDimension()
    }

    // Rysuj wymiar Wys. zawieszenia (żółty → niebieski) gdy lastRungToGround > 350mm
    const distFromGround = props.distanceFromGround || 160
    const lastRungToGround = distFromGround + suspendedHeight1
    if (lastRungToGround > 350 && finalLadderBottomBoxY !== null && groundTopBoxY !== null) {
      const geoConfig1 = ladderGeometryConfig[1]
      if (isAtticPassage) {
        // Attyka: wymiar z przodu (jak dł. drabiny), do tyłu gdy brak kosza
        const boxZOffset = 334 * SCALE
        const zPos = (geoConfig1.zOffset + 241) * SCALE + boxZOffset - noCageBackOffset
        drawSuspensionHeightDimension(zPos, true)
      } else {
        // Klasyczna/podest: wymiar z tyłu
        const zPos = (geoConfig1.zOffset + 241) * SCALE - backOffset
        drawSuspensionHeightDimension(zPos, false)
      }
    }

    // Rysuj wymiar zielony → czerwony (tylko dla attyki) - przy ścianie
    if (isAtticPassage && roofTopBoxY !== null && wallTopBoxY !== null) {
      const wallThickness = props.atticWallThickness || 250
      const wallZ = -(globalWspornikDistance1 + (wallThickness / 2) + 33) * SCALE
      drawGreenRedDimension(wallZ, true)
    }

    // Rysuj wymiar Dł. Drabiny strona zejścia (fioletowy → zielony) - tylko dla attyki
    if (isAtticPassage && roofTopBoxY !== null && descentWallTopBoxY !== null) {
      const geoConfig1 = ladderGeometryConfig[1]
      const zPos = (geoConfig1.zOffset + 241) * SCALE - backOffset
      drawDescentLadderLengthDimension(zPos)
    }

    // Rysuj info label z tyłu sceny (tylko dla klasycznej/z podestem)
    if (!isAtticPassage) {
      const geoConfig1 = ladderGeometryConfig[1]
      const zPos = (geoConfig1.zOffset + 241) * SCALE - backOffset
      // Pobierz typ wspornika (pierwszy nie-none lub 'none')
      const wspornikType = wspornikTypes1.find(t => t !== 'none') || 'none'
      const hasCage = safetyCageCount1 > 0
      const isPlatform = props.scheme === 'with-platform' || props.scheme === 'platform'
      const insulationThickness = props.hasInsulation ? (props.insulationThickness || 0) : 0
      drawInfoLabel(Math.round(lastRungToGround), Math.round(wallHeightConfig), wspornikType, hasCage, isPlatform, insulationThickness, zPos)
    } else {
      // Rysuj info label dla attyki
      const geoConfig1 = ladderGeometryConfig[1]
      const zPos = (geoConfig1.zOffset + 241) * SCALE - backOffset

      // Pobierz typy wsporników
      const wspornikEntry = wspornikTypes1.find(t => t !== 'none') || 'none'
      const wspornikDescent = wspornikTypes2.find(t => t !== 'none') || 'none'

      // Sprawdź czy jest bigfoot
      const hasBigfoot = props.descentMountType === 'bigfoot'

      // Sprawdź czy jest kosz
      const hasCage = safetyCageCount1 > 0

      // Grubość ocieplenia
      const insulationEntry = props.atticHasInsulation ? (props.atticInsulationThickness || 0) : 0
      const insulationDescent = props.atticBackHasInsulation ? (props.atticBackInsulationThickness || 0) : 0

      drawAtticInfoLabel({
        wspornikEntry,
        wspornikDescent,
        hasBigfoot,
        hasCage,
        wallHeight: Math.round(wallHeightConfig),
        lastRungToGround: Math.round(lastRungToGround),
        insulationEntry,
        insulationDescent
      }, zPos)
    }
  }

  // Render obstacles
  createObstacles()

  // Create green collision boxes for wsporniki
  createGreenCollisionBoxes()

  // Check obstacle collisions
  checkObstacleCollisions()

  // Position ladder based on wall height
  positionLadder(height1, maxHeight)

  // Emit update
  emitUpdate()

  // Re-enable outlines after a delay (for performance)
  if (outlineUserEnabled) {
    outlineDelayTimer = setTimeout(() => {
      outlineEnabled = true
      reapplyOutlines()
      requestRender() // Render after outlines are applied
    }, 300)
  }
}

// ============================================
// RENDER SAFETY HANDRAILS
// ============================================
function renderSafetyHandrails(totalHeight: number) {
  const topOfLadder = totalHeight / 2

  if (loadedModels.porecz) {
    // Left handrail
    const leftPorecz = loadedModels.porecz.clone(true)
    leftPorecz.scale.set(SCALE, SCALE, SCALE)
    leftPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    leftPorecz.position.x = -RAIL_OFFSET * SCALE
    leftPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    leftPorecz.position.z = (-245.5 - 3) * SCALE  // Korekta -3mm
    leftPorecz.userData.isHandrail = true
    leftPorecz.userData.ladderNum = 1
    leftPorecz.userData.side = 'left'
    const leftHandrailId = `handrail_1_left`
    leftPorecz.userData.elementId = leftHandrailId
    leftPorecz.traverse((child) => {
      child.userData.isHandrail = true
      child.userData.ladderNum = 1
      child.userData.side = 'left'
      child.userData.elementId = leftHandrailId
    })
    addOutlineToModel(leftPorecz)
    ladderContainer.add(leftPorecz)

    // Right handrail
    const rightPorecz = loadedModels.porecz.clone(true)
    rightPorecz.scale.set(SCALE, SCALE, SCALE)
    rightPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    rightPorecz.position.x = RAIL_OFFSET * SCALE
    rightPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    rightPorecz.position.z = (-245.5 - 3) * SCALE  // Korekta -3mm
    rightPorecz.userData.isHandrail = true
    rightPorecz.userData.ladderNum = 1
    rightPorecz.userData.side = 'right'
    const rightHandrailId = `handrail_1_right`
    rightPorecz.userData.elementId = rightHandrailId
    rightPorecz.traverse((child) => {
      child.userData.isHandrail = true
      child.userData.ladderNum = 1
      child.userData.side = 'right'
      child.userData.elementId = rightHandrailId
    })
    addOutlineToModel(rightPorecz)
    ladderContainer.add(rightPorecz)
  }
}

// ============================================
// RENDER PLATFORM HANDRAILS
// ============================================
function renderPlatformHandrails(totalHeight: number, shouldRenderHandrails: boolean = true) {
  const topOfLadder = totalHeight / 2

  // Handrails only if shouldRenderHandrails is true
  if (loadedModels.porecz && shouldRenderHandrails) {
    const leftPorecz = loadedModels.porecz.clone(true)
    leftPorecz.scale.set(SCALE, SCALE, SCALE)
    leftPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    leftPorecz.position.x = -RAIL_OFFSET * SCALE
    leftPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    leftPorecz.position.z = (-245.5 - 3) * SCALE  // Korekta -3mm
    leftPorecz.userData.isHandrail = true
    leftPorecz.userData.ladderNum = 1
    leftPorecz.userData.side = 'left'
    leftPorecz.userData.handrailType = 'platform'
    const leftPlatformHandrailId = `handrail_1_left`
    leftPorecz.userData.elementId = leftPlatformHandrailId
    leftPorecz.traverse((child) => {
      child.userData.isHandrail = true
      child.userData.ladderNum = 1
      child.userData.side = 'left'
      child.userData.elementId = leftPlatformHandrailId
    })
    addOutlineToModel(leftPorecz)
    ladderContainer.add(leftPorecz)

    const rightPorecz = loadedModels.porecz.clone(true)
    rightPorecz.scale.set(SCALE, SCALE, SCALE)
    rightPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    rightPorecz.position.x = RAIL_OFFSET * SCALE
    rightPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    rightPorecz.position.z = (-245.5 - 3) * SCALE  // Korekta -3mm
    rightPorecz.userData.isHandrail = true
    rightPorecz.userData.ladderNum = 1
    rightPorecz.userData.side = 'right'
    rightPorecz.userData.handrailType = 'platform'
    const rightPlatformHandrailId = `handrail_1_right`
    rightPorecz.userData.elementId = rightPlatformHandrailId
    rightPorecz.traverse((child) => {
      child.userData.isHandrail = true
      child.userData.ladderNum = 1
      child.userData.side = 'right'
      child.userData.elementId = rightPlatformHandrailId
    })
    addOutlineToModel(rightPorecz)
    ladderContainer.add(rightPorecz)
  }

  // Platform on top
  if (loadedModels.podestKrotki) {
    const podest = loadedModels.podestKrotki.clone(true)
    podest.scale.set(SCALE, SCALE, SCALE)
    podest.rotation.set(Math.PI * 1.5, 0, 0)
    podest.position.x = 0
    podest.position.y = (topOfLadder + DIMS.handrailVertical / 2 - 536) * SCALE
    podest.position.z = (-245.5 - 3) * SCALE  // Korekta -3mm
    podest.userData.isPlatform = true
    podest.userData.ladderNum = 1
    const platformElementId = `platform_1`
    podest.userData.elementId = platformElementId
    podest.traverse((child) => {
      child.userData.isPlatform = true
      child.userData.ladderNum = 1
      child.userData.elementId = platformElementId
    })
    addOutlineToModel(podest)
    ladderContainer.add(podest)

    // Marker for Krata WEMA 50x50 (part of podest model, but separate BOM item)
    const krataMarker = new THREE.Group()
    krataMarker.userData.isKrataWema = true
    krataMarker.userData.krataSize = '50x50'
    krataMarker.userData.ladderNum = 1
    ladderContainer.add(krataMarker)
  }
}

// ============================================
// RENDER ATTIC PASSAGE
// ============================================
function renderAtticPassage(totalHeight: number) {
  const topOfMainRails = totalHeight / 2

  if (loadedModels.attyka) {
    const attyka = loadedModels.attyka.clone(true)
    attyka.scale.set(SCALE, SCALE, SCALE)
    attyka.rotation.set(Math.PI * 1.5, 0, 0)
    attyka.position.x = 0
    attyka.position.y = (topOfMainRails + DIMS.atticRailHeight / 2) * SCALE
    attyka.position.z = (-535 - 3) * SCALE  // Korekta -3mm
    attyka.userData.ladderNum = 0
    attyka.userData.isAtticPassage = true
    addOutlineToModel(attyka)
    ladderContainer.add(attyka)
  }

  if (loadedModels.krataWema) {
    const krata = loadedModels.krataWema.clone(true)
    krata.scale.set(SCALE, SCALE, SCALE)
    krata.rotation.set(Math.PI * 1.5, 0, 0)
    krata.position.x = 0
    krata.position.y = (topOfMainRails + DIMS.atticRailHeight / 2 - 430) * SCALE
    krata.position.z = (-535 - 3) * SCALE  // Korekta -3mm
    krata.userData.ladderNum = 0
    krata.userData.isKrataWema = true
    krata.userData.krataSize = '100x50'
    addOutlineToModel(krata)
    ladderContainer.add(krata)
  }

  // BIGFOOT - renderuj gdy typ montażu zejścia to bigfoot
  if (props.descentMountType === 'bigfoot') {
    // Stała pozycja Z (bigfoot nie przesuwa się z drabiną)
    // Oryginalna formuła: -(215 + 250 + 33 + 250 + 1000 - 678) = -1070, + korekta -3mm
    const bigfootZ = -1070 - 3

    // Oblicz pozycję na szczycie ściany zejścia (dachu)
    const atticDist = props.atticPlatformDistance ?? 0
    const topOffset = -161 + 511 - atticDist
    const ladderTop = totalHeight / 2
    const groundLevel = ladderTop - wallHeightConfig + topOffset
    const groundThickness = 50

    // Wysokość ściany zejścia = główna ściana - atticWallHeight (wartość wpisana przez użytkownika w mm)
    const descentWallHeight = wallHeightConfig - (props.atticWallHeight ?? 0)
    // Bigfoot stoi na szczycie ściany zejścia (dachu) + 45mm
    const bigfootBaseY = groundLevel + groundThickness / 2 + descentWallHeight + 45
    
    if (loadedModels.bigfoot) {
      const bigfoot = loadedModels.bigfoot.clone(true)
      bigfoot.scale.set(SCALE, SCALE, SCALE)
      bigfoot.rotation.set(Math.PI * 1.5, 0, 0)
      bigfoot.position.x = 0
      bigfoot.position.y = bigfootBaseY * SCALE
      bigfoot.position.z = bigfootZ * SCALE
      bigfoot.userData.isBigfoot = true
      // Pokoloruj bigfoot na ciemnoszary (zachowaj teksturę)
      bigfoot.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial
          if (mat.color) {
            mat.color.setHex(0x666666)  // Szary
          }
        }
      })
      addOutlineToModel(bigfoot)
      ladderContainer.add(bigfoot)
    }
    
    if (loadedModels.prowadnicaBigfoot) {
      const prowadnica = loadedModels.prowadnicaBigfoot.clone(true)
      prowadnica.scale.set(SCALE, SCALE, SCALE)
      prowadnica.rotation.set(Math.PI * 1.5, 0, 0)
      prowadnica.position.x = 0
      prowadnica.position.y = (bigfootBaseY + 33) * SCALE  // 33mm wyżej
      prowadnica.position.z = bigfootZ * SCALE
      prowadnica.userData.isBigfootGuide = true
      addOutlineToModel(prowadnica)
      ladderContainer.add(prowadnica)
    }
    
    // Drabina zejścia dla BIGFOOT (1-4 szczeble)
    if (props.descentLadder && props.descentLadder.endLadderRungs > 0) {
      const descentRungs = props.descentLadder.endLadderRungs
      const descentLadderModel = loadedModels.koncowa[descentRungs]
      if (descentLadderModel) {
        const ladder = descentLadderModel.clone(true)
        ladder.scale.set(SCALE, SCALE, SCALE)
        ladder.rotation.set(Math.PI * 1.5, 0, 0)
        ladder.position.x = 0
        // Pozycja absolutna względem przełazu (topOfMainRails)
        // Góra drabiny = dół przełazu - 3mm
        // Model ma origin na środku, więc: środek = góra - (rungs * 275 / 2)
        const ladderTopY = topOfMainRails - 3 + 49  // +3mm korekta  // 3mm pod przełazem + 46mm wyżej
        const ladderCenterY = ladderTopY - (descentRungs * 275 / 2)
        ladder.position.y = ladderCenterY * SCALE
        ladder.position.z = bigfootZ * SCALE
        ladder.userData.isDescentLadder = true
        ladder.userData.ladderNum = 2
        ladder.userData.isLadderModule = true
        ladder.userData.rungs = descentRungs
        ladder.userData.moduleType = 'final'
        addOutlineToModel(ladder)
        ladderContainer.add(ladder)

        // Łączniki dla drabiny zejścia (para L+P) - pozycja absolutna
        if (loadedModels.lacznik) {
          const connectorY = topOfMainRails + 46 - 52  // Na wysokości góry drabiny zejścia - 52mm
          
          // Lewy łącznik
          const leftConn = loadedModels.lacznik.clone(true)
          leftConn.scale.set(SCALE, SCALE, SCALE)
          leftConn.rotation.set(Math.PI * 1.5, 0, Math.PI)  // +180° w Z
          leftConn.position.x = -(175 + 88 + 3) * SCALE  // Lewa strona + 91mm
          leftConn.position.y = connectorY * SCALE
          leftConn.position.z = bigfootZ * SCALE
          leftConn.userData.isDescentConnector = true
          addOutlineToModel(leftConn)
          ladderContainer.add(leftConn)
          
          // Prawy łącznik
          const rightConn = loadedModels.lacznik.clone(true)
          rightConn.scale.set(SCALE, SCALE, SCALE)
          rightConn.rotation.set(Math.PI * 1.5, 0, 0)  // +180° w Z (odbicie)
          rightConn.position.x = (175 + 88 + 3) * SCALE  // Prawa strona + 91mm
          rightConn.position.y = connectorY * SCALE
          rightConn.position.z = bigfootZ * SCALE
          rightConn.userData.isDescentConnector = true
          addOutlineToModel(rightConn)
          ladderContainer.add(rightConn)
        }
      }
    }
  }
  // CUSTOM-BASE - własne podłoże (bloczki + drabina i łączniki)
  if (props.descentMountType === 'custom-base') {
    // Stała pozycja Z (tak samo jak bigfoot) + korekta -3mm
    const customBaseZ = -1070 - 3

    // Oblicz pozycję dachu (szczyt ściany zejścia)
    const atticDist = props.atticPlatformDistance ?? 0
    const topOffset = -161 + 511 - atticDist
    const ladderTop = totalHeight / 2
    const groundLevel = ladderTop - wallHeightConfig + topOffset
    const groundThickness = 50
    // Wysokość ściany zejścia = główna ściana - atticWallHeight
    const descentWallHeight = wallHeightConfig - (props.atticWallHeight ?? 0)
    const roofTopY = groundLevel + groundThickness / 2 + descentWallHeight

    // Bloczki/podkładki - wysokość z inputa
    const blocksHeightMm = (props.customBaseHeight ?? 0)  // już w mm
    if (blocksHeightMm > 0) {
      const blocksWidth = 1000   // szerokość bloczków
      const blocksDepth = 1000   // głębokość bloczków
      const blocksGeometry = new THREE.BoxGeometry(
        blocksWidth * SCALE,
        blocksHeightMm * SCALE,
        blocksDepth * SCALE
      )
      const blocksMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,  // szary
        roughness: 0.8,
        metalness: 0.1
      })
      const blocks = new THREE.Mesh(blocksGeometry, blocksMaterial)
      // Środek bloczków = dach + połowa wysokości bloczków
      blocks.position.x = 0
      blocks.position.y = (roofTopY + blocksHeightMm / 2) * SCALE
      blocks.position.z = customBaseZ * SCALE
      blocks.userData.isCustomBaseBlocks = true
      blocks.castShadow = true
      blocks.receiveShadow = true
      ladderContainer.add(blocks)
    }

    // Drabina zejścia (tak samo jak BIGFOOT)
    if (props.descentLadder && props.descentLadder.endLadderRungs > 0) {
      const descentRungs = props.descentLadder.endLadderRungs
      const descentLadderModel = loadedModels.koncowa[descentRungs]
      if (descentLadderModel) {
        const ladder = descentLadderModel.clone(true)
        ladder.scale.set(SCALE, SCALE, SCALE)
        ladder.rotation.set(Math.PI * 1.5, 0, 0)
        ladder.position.x = 0
        const ladderTopY = topOfMainRails - 3 + 49
        const ladderCenterY = ladderTopY - (descentRungs * 275 / 2)
        ladder.position.y = ladderCenterY * SCALE
        ladder.position.z = customBaseZ * SCALE
        ladder.userData.isDescentLadder = true
        ladder.userData.ladderNum = 2
        ladder.userData.isLadderModule = true
        ladder.userData.rungs = descentRungs
        ladder.userData.moduleType = 'final'
        addOutlineToModel(ladder)
        ladderContainer.add(ladder)

        if (loadedModels.lacznik) {
          const connectorY = topOfMainRails + 46 - 52

          const leftConn = loadedModels.lacznik.clone(true)
          leftConn.scale.set(SCALE, SCALE, SCALE)
          leftConn.rotation.set(Math.PI * 1.5, 0, Math.PI)
          leftConn.position.x = -(175 + 88 + 3) * SCALE
          leftConn.position.y = connectorY * SCALE
          leftConn.position.z = customBaseZ * SCALE
          leftConn.userData.isDescentConnector = true
          addOutlineToModel(leftConn)
          ladderContainer.add(leftConn)

          const rightConn = loadedModels.lacznik.clone(true)
          rightConn.scale.set(SCALE, SCALE, SCALE)
          rightConn.rotation.set(Math.PI * 1.5, 0, 0)
          rightConn.position.x = (175 + 88 + 3) * SCALE
          rightConn.position.y = connectorY * SCALE
          rightConn.position.z = customBaseZ * SCALE
          rightConn.userData.isDescentConnector = true
          addOutlineToModel(rightConn)
          ladderContainer.add(rightConn)
        }
      }
    }
  }

  // Drabina zejścia dla brackets/self (pełna drabina)
  if ((props.descentMountType === 'brackets' || props.descentMountType === 'self') && props.descentLadder) {
    renderDescentLadderFull(totalHeight)
  }
}

// ============================================
// RENDER DESCENT LADDER (dla brackets/self)
// ============================================
function renderDescentLadderFull(totalHeight: number) {
  if (!props.descentLadder) return
  
  const { repeatLadder7, endLadderRungs } = props.descentLadder
  
  // Pozycja Z - za ścianą zejścia
  // Dla brackets: stała pozycja Z (nie przesuwa się z drabiną wejściową)
  // Dla self: pozycja zależy od wsporników drabiny wejściowej
  let descentLadderZ: number
  if (props.descentMountType === 'brackets') {
    // Stała pozycja Z -1070 - 3mm korekta (jak bigfoot)
    descentLadderZ = -1070 - 3
  } else {
    const wallThickness = 250
    const wallZ = -(globalWspornikDistance1 + wallThickness / 2 + 33)
    descentLadderZ = wallZ - wallThickness - 447 - 3  // 10cm + 347mm za ścianą zejścia + korekta -3mm
  }

  // Save Z position for use in renderSciskaneHandles
  descentLadderZPosition = descentLadderZ

  // Pozycja Y - punkt startowy (góra drabiny zejścia)
  const topOfMainRails = totalHeight / 2
  const ladderStartY = topOfMainRails - 91  // 3mm pod przełazem + korekty
  
  const X7_HEIGHT = 1925  // 7 szczebli * 275mm = 1925mm
  
  // Renderuj powielane x7
  for (let i = 0; i < repeatLadder7; i++) {
    if (loadedModels.powielana) {
      const ladder = loadedModels.powielana.clone(true)
      ladder.scale.set(SCALE, SCALE, SCALE)
      ladder.rotation.set(Math.PI * 1.5, 0, Math.PI)
      ladder.position.x = 0
      // Środek x7: startY - offset dla środka - (i * wysokość x7)
      const x7CenterY = ladderStartY - (X7_HEIGHT / 2) + 89 - (i * X7_HEIGHT)
      ladder.position.y = x7CenterY * SCALE
      ladder.position.z = descentLadderZ * SCALE
      ladder.userData.isDescentLadder = true
      ladder.userData.ladderNum = 2
      ladder.userData.isLadderModule = true
      ladder.userData.rungs = 7
      ladder.userData.moduleType = 'standard'
      addOutlineToModel(ladder)
      ladderContainer.add(ladder)
    }
  }
  
  // Renderuj końcową
  if (endLadderRungs > 0 && loadedModels.koncowa[endLadderRungs]) {
    const endLadder = loadedModels.koncowa[endLadderRungs].clone(true)
    endLadder.scale.set(SCALE, SCALE, SCALE)
    endLadder.rotation.set(Math.PI * 1.5, 0, Math.PI)
    endLadder.position.x = 0
    
    // Pozycja końcowej
    let endLadderY
    if (repeatLadder7 > 0) {
      // Pod ostatnią x7 z 3mm odstępem
      const bottomOfAllX7 = ladderStartY - (repeatLadder7 * X7_HEIGHT)
      endLadderY = bottomOfAllX7 - 1 - ((endLadderRungs - 1) * 275 / 2)
    } else {
      // Bez x7 - końcowa zaczyna od góry
      endLadderY = ladderStartY - ((endLadderRungs - 1) * 275 / 2)
    }
    
    endLadder.position.y = endLadderY * SCALE
    endLadder.position.z = descentLadderZ * SCALE
    endLadder.userData.isDescentLadder = true
    endLadder.userData.ladderNum = 2
    endLadder.userData.isLadderModule = true
    endLadder.userData.rungs = endLadderRungs
    endLadder.userData.moduleType = 'final'
    addOutlineToModel(endLadder)
    ladderContainer.add(endLadder)
  }

  // Uchwyty i wsporniki dla brackets mode (lustrzane odbicie strony wejścia)
  if (props.descentMountType === 'brackets') {
    renderDescentLadderConnectors(totalHeight, descentLadderZ, repeatLadder7, endLadderRungs)
  }
}

// ============================================
// RENDER DESCENT LADDER CONNECTORS (dla brackets)
// ============================================
function renderDescentLadderConnectors(
  totalHeight: number,
  descentLadderZ: number,
  repeatLadder7: number,
  endLadderRungs: number
) {
  const geoConfig = ladderGeometryConfig[2]
  const X7_HEIGHT = 1925
  const SECTION_GAP = 3

  // Calculate number of connector pairs needed
  let numConnectorPairs = 1  // Top connector always
  for (let i = 0; i < repeatLadder7; i++) {
    const isLastX7 = (i === repeatLadder7 - 1)
    const hasMoreSections = !isLastX7 || endLadderRungs > 0
    if (hasMoreSections) {
      numConnectorPairs++
    }
  }

  // Initialize/resize wspornikTypes2 and wspornikDistances2 arrays
  const globalDistance = globalWspornikDistance2 || 215
  const defaultWsp = defaultWspornik2 || 'krotki'

  // Truncate arrays if they're too long (configuration changed to fewer sections)
  if (wspornikTypes2.length > numConnectorPairs) {
    wspornikTypes2.length = numConnectorPairs
  }
  if (wspornikDistances2.length > numConnectorPairs) {
    wspornikDistances2.length = numConnectorPairs
  }
  if (connectorTypes2.length > numConnectorPairs) {
    connectorTypes2.length = numConnectorPairs
  }

  // Expand arrays if needed
  while (wspornikTypes2.length < numConnectorPairs) {
    wspornikTypes2.push(defaultWsp)
  }
  while (wspornikDistances2.length < numConnectorPairs) {
    wspornikDistances2.push(globalDistance)
  }
  while (connectorTypes2.length < numConnectorPairs) {
    connectorTypes2.push('uchwyt')
  }

  // Pozycja Y - punkt startowy (góra drabiny zejścia)
  const topOfMainRails = totalHeight / 2
  const ladderStartY = topOfMainRails - 91

  // Track pair index for descent ladder connectors
  let pairIndex = 0

  // Górny łącznik (pod przełazem) - midrung 113mm w dół
  const topY = ladderStartY + (DIMS.connectorHeight / 2) + 50
  const topConnectorYOffset = 100 - 113  // Korekta -113mm
  const connectorZOffset = 0  // Bez korekty - przesunięcie całej drabiny w ladderGeometryConfig

  // Typ łącznika z wyboru użytkownika, a NIE 'uchwyt' na sztywno.
  // BOM powstaje z przejścia po scenie, więc wpisany na stałe uchwyt znaczył,
  // że wybranie łącznika na drabinie zejścia nigdzie się nie liczyło - ani
  // w wycenie, ani na liście elementów. Wsporniki dwie linie niżej robiły to
  // już poprawnie, przez wspornikTypes2[pairIndex].
  const topConnType = connectorTypes2[pairIndex] || 'uchwyt'

  // Łącznik lewy górny
  const leftConnTop = createConnector(topConnType, 'left', 2)
  leftConnTop.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
  leftConnTop.position.y = (topY + topConnectorYOffset) * SCALE
  leftConnTop.position.z = (-62.5 + descentLadderZ + geoConfig.connector.uchwytZOffset + connectorZOffset) * SCALE
  leftConnTop.userData.isDescentConnector = true
  leftConnTop.userData.pairIndex = pairIndex
  ladderContainer.add(leftConnTop)

  // Łącznik prawy górny
  const rightConnTop = createConnector(topConnType, 'right', 2)
  rightConnTop.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
  rightConnTop.position.y = (topY + topConnectorYOffset) * SCALE
  rightConnTop.position.z = (-62.5 + descentLadderZ + geoConfig.connector.uchwytZOffset + connectorZOffset) * SCALE
  rightConnTop.userData.isDescentConnector = true
  rightConnTop.userData.pairIndex = pairIndex
  ladderContainer.add(rightConnTop)

  // Wsporniki górne - use type from wspornikTypes2 array or default
  const topWspornikType = wspornikTypes2[pairIndex] || defaultWspornik2 || 'krotki'
  const topWspornikDistance = wspornikDistances2[pairIndex] || globalWspornikDistance2 || 215

  if (topWspornikType !== 'none') {
    const defaultDist = wspornikDefaultDistances[topWspornikType]
    const distanceOffset = topWspornikDistance - defaultDist
    const distanceZOffset = distanceOffset

    const leftWspornikTop = createWspornik(topWspornikType, 'left', 2)
    if (leftWspornikTop) {
      leftWspornikTop.position.x = (-RAIL_OFFSET + leftWspornikTop.userData.extraXOffset) * SCALE
      leftWspornikTop.position.y = (topY + topConnectorYOffset + leftWspornikTop.userData.extraYOffset) * SCALE
      leftWspornikTop.position.z = (geoConfig.wspornik.zOffset + descentLadderZ + leftWspornikTop.userData.extraZOffset + distanceZOffset + connectorZOffset) * SCALE
      leftWspornikTop.userData.isDescentConnector = true
      leftWspornikTop.userData.pairIndex = pairIndex
      ladderContainer.add(leftWspornikTop)
    }

    const rightWspornikTop = createWspornik(topWspornikType, 'right', 2)
    if (rightWspornikTop) {
      rightWspornikTop.position.x = (RAIL_OFFSET - rightWspornikTop.userData.extraXOffset) * SCALE
      rightWspornikTop.position.y = (topY + topConnectorYOffset + rightWspornikTop.userData.extraYOffset) * SCALE
      rightWspornikTop.position.z = (geoConfig.wspornik.zOffset + descentLadderZ + rightWspornikTop.userData.extraZOffset + distanceZOffset + connectorZOffset) * SCALE
      rightWspornikTop.userData.isDescentConnector = true
      rightWspornikTop.userData.pairIndex = pairIndex
      ladderContainer.add(rightWspornikTop)
    }
  }

  pairIndex++

  // Renderuj łączniki między sekcjami
  let currentOffset = 0

  for (let i = 0; i < repeatLadder7; i++) {
    currentOffset += X7_HEIGHT

    // Łącznik po każdej sekcji x7 (oprócz ostatniej jeśli nie ma końcowej)
    const isLastX7 = (i === repeatLadder7 - 1)
    const hasMoreSections = !isLastX7 || endLadderRungs > 0

    if (hasMoreSections) {
      const gapCenterOffset = SECTION_GAP / 2
      const connectionY = ladderStartY - currentOffset - gapCenterOffset + (DIMS.connectorHeight / 2) - 50 + 91  // Korekta +91mm

      // Typ z wyboru użytkownika - patrz komentarz przy górnym łączniku
      const loopConnType = connectorTypes2[pairIndex] || 'uchwyt'

      // Łącznik lewy
      const leftConn = createConnector(loopConnType, 'left', 2)
      leftConn.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
      leftConn.position.y = connectionY * SCALE
      leftConn.position.z = (-62.5 + descentLadderZ + geoConfig.connector.uchwytZOffset + connectorZOffset) * SCALE
      leftConn.userData.isDescentConnector = true
      leftConn.userData.pairIndex = pairIndex
      ladderContainer.add(leftConn)

      // Łącznik prawy
      const rightConn = createConnector(loopConnType, 'right', 2)
      rightConn.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
      rightConn.position.y = connectionY * SCALE
      rightConn.position.z = (-62.5 + descentLadderZ + geoConfig.connector.uchwytZOffset + connectorZOffset) * SCALE
      rightConn.userData.isDescentConnector = true
      rightConn.userData.pairIndex = pairIndex
      ladderContainer.add(rightConn)

      // Wsporniki - use type from wspornikTypes2 array for each pairIndex
      const loopWspornikType = wspornikTypes2[pairIndex] || defaultWspornik2 || 'krotki'
      const loopWspornikDistance = wspornikDistances2[pairIndex] || globalWspornikDistance2 || 215

      if (loopWspornikType !== 'none') {
        const defaultDist = wspornikDefaultDistances[loopWspornikType]
        const distanceOffset = loopWspornikDistance - defaultDist
        const distanceZOffset = distanceOffset  // Dla ladder 2, kierunek jest odwrócony

        const leftWspornik = createWspornik(loopWspornikType, 'left', 2)
        if (leftWspornik) {
          leftWspornik.position.x = (-RAIL_OFFSET + leftWspornik.userData.extraXOffset) * SCALE
          leftWspornik.position.y = (connectionY + leftWspornik.userData.extraYOffset) * SCALE
          leftWspornik.position.z = (geoConfig.wspornik.zOffset + descentLadderZ + leftWspornik.userData.extraZOffset + distanceZOffset + connectorZOffset) * SCALE
          leftWspornik.userData.isDescentConnector = true
          leftWspornik.userData.pairIndex = pairIndex
          ladderContainer.add(leftWspornik)
        }

        const rightWspornik = createWspornik(loopWspornikType, 'right', 2)
        if (rightWspornik) {
          rightWspornik.position.x = (RAIL_OFFSET - rightWspornik.userData.extraXOffset) * SCALE
          rightWspornik.position.y = (connectionY + rightWspornik.userData.extraYOffset) * SCALE
          rightWspornik.position.z = (geoConfig.wspornik.zOffset + descentLadderZ + rightWspornik.userData.extraZOffset + distanceZOffset + connectorZOffset) * SCALE
          rightWspornik.userData.isDescentConnector = true
          rightWspornik.userData.pairIndex = pairIndex
          ladderContainer.add(rightWspornik)
        }
      }

      pairIndex++
      currentOffset += SECTION_GAP
    }
  }
}

// ============================================
// RENDER CONNECTORS FOR LADDER
// ============================================
function renderConnectorsForLadder(ladderNum: number, maxHeight: number) {
  const connSections = getLadderSectionsForLadder(ladderNum)
  const connConnectorTypes = getConnectorTypesForLadder(ladderNum)
  const connWspornikTypes = getWspornikTypesForLadder(ladderNum)
  const defaultWspornik = getDefaultWspornikForLadder(ladderNum)

  // Calculate number of connector pairs needed
  let numConnectorPairs = 0
  if ((handrailType === 'safety' || handrailType === 'attic') && connSections.length > 0) {
    numConnectorPairs++
  }
  numConnectorPairs += Math.max(0, connSections.length - 1)

  // Initialize arrays
  const globalDistance = (ladderNum === 1) ? globalWspornikDistance1 : globalWspornikDistance2
  const connWspornikDistances = (ladderNum === 1) ? wspornikDistances1 : wspornikDistances2

  while (connConnectorTypes.length < numConnectorPairs) {
    connConnectorTypes.push('uchwyt')
  }
  while (connWspornikTypes.length < numConnectorPairs) {
    connWspornikTypes.push(defaultWspornik)
  }
  while (connWspornikDistances.length < numConnectorPairs) {
    connWspornikDistances.push(globalDistance)
  }

  let pairIndex = 0

  // Top connector (for safety or attic handrails) - NOT for platform (connectors built into podest model)
  if ((handrailType === 'safety' || handrailType === 'attic') && connSections.length > 0) {
    const topY = (maxHeight / 2) - (DIMS.connectorHeight / 2) - 50
    const topConnectorType = (handrailType === 'safety') ? 'uchwytPoreczy' : connConnectorTypes[pairIndex]

    const topConnectorZ = (handrailType === 'safety') ? 0 : ((topConnectorType === 'lacznik') ? 0 : -62.5)
    const topConnectorYOffset = 100

    const geoConfig = ladderGeometryConfig[ladderNum]
    const topTypeZOffset = (topConnectorType === 'lacznik') ? geoConfig.connector.zOffset : geoConfig.connector.uchwytZOffset

    const leftConnectorTop = createConnector(topConnectorType, 'left', ladderNum)
    leftConnectorTop.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
    leftConnectorTop.position.y = (topY + topConnectorYOffset) * SCALE
    leftConnectorTop.position.z = (topConnectorZ + geoConfig.zOffset + topTypeZOffset) * SCALE
    leftConnectorTop.userData.pairIndex = pairIndex
    ladderContainer.add(leftConnectorTop)

    const rightConnectorTop = createConnector(topConnectorType, 'right', ladderNum)
    rightConnectorTop.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
    rightConnectorTop.position.y = (topY + topConnectorYOffset) * SCALE
    rightConnectorTop.position.z = (topConnectorZ + geoConfig.zOffset + topTypeZOffset) * SCALE
    rightConnectorTop.userData.pairIndex = pairIndex
    ladderContainer.add(rightConnectorTop)

    // Wsporniki for top connector - positioned relative to connector
    if (topConnectorType === 'uchwyt') {
      const wspornikType = connWspornikTypes[pairIndex] || defaultWspornik
      if (wspornikType !== 'none') {
        const customDistance = connWspornikDistances[pairIndex] || wspornikDefaultDistances[wspornikType]
        const defaultDist = wspornikDefaultDistances[wspornikType]
        const distanceOffset = customDistance - defaultDist
        const distanceZOffset = (ladderNum === 1) ? -distanceOffset : distanceOffset

        const leftWspornikTop = createWspornik(wspornikType, 'left', ladderNum)
        if (leftWspornikTop) {
          leftWspornikTop.position.x = (-RAIL_OFFSET + leftWspornikTop.userData.extraXOffset) * SCALE
          leftWspornikTop.position.y = (topY + topConnectorYOffset + leftWspornikTop.userData.extraYOffset) * SCALE
          leftWspornikTop.position.z = (geoConfig.wspornik.zOffset + geoConfig.zOffset + leftWspornikTop.userData.extraZOffset + distanceZOffset) * SCALE
          leftWspornikTop.userData.pairIndex = pairIndex
          ladderContainer.add(leftWspornikTop)
        }

        const rightWspornikTop = createWspornik(wspornikType, 'right', ladderNum)
        if (rightWspornikTop) {
          rightWspornikTop.position.x = (RAIL_OFFSET - rightWspornikTop.userData.extraXOffset) * SCALE
          rightWspornikTop.position.y = (topY + topConnectorYOffset + rightWspornikTop.userData.extraYOffset) * SCALE
          rightWspornikTop.position.z = (geoConfig.wspornik.zOffset + geoConfig.zOffset + rightWspornikTop.userData.extraZOffset + distanceZOffset) * SCALE
          rightWspornikTop.userData.pairIndex = pairIndex
          ladderContainer.add(rightWspornikTop)
        }
      }
    }

    pairIndex++
  }

  // Connectors between sections
  let currentOffset = 0
  const SECTION_GAP = 3

  for (let i = 0; i < connSections.length; i++) {
    const section = connSections[i]
    const sectionHeight = section.type === 'alt' ? getLadderHeight('7alt') : getLadderHeight(section.rungs)
    currentOffset += sectionHeight

    if (i < connSections.length - 1) {
      const gapCenterOffset = SECTION_GAP / 2
      const connectionY = (maxHeight / 2) - currentOffset - gapCenterOffset + (DIMS.connectorHeight / 2) - 50
      const connType = connConnectorTypes[pairIndex] || 'uchwyt'

      const connGeoConfig = ladderGeometryConfig[ladderNum]
      const connTypeZOffset = (connType === 'lacznik') ? connGeoConfig.connector.zOffset : connGeoConfig.connector.uchwytZOffset

      const leftConn = createConnector(connType, 'left', ladderNum)
      leftConn.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
      leftConn.position.y = connectionY * SCALE
      leftConn.position.z = ((connType === 'lacznik' ? 0 : -62.5) + connGeoConfig.zOffset + connTypeZOffset) * SCALE
      leftConn.userData.pairIndex = pairIndex
      ladderContainer.add(leftConn)

      const rightConn = createConnector(connType, 'right', ladderNum)
      rightConn.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
      rightConn.position.y = connectionY * SCALE
      rightConn.position.z = ((connType === 'lacznik' ? 0 : -62.5) + connGeoConfig.zOffset + connTypeZOffset) * SCALE
      rightConn.userData.pairIndex = pairIndex
      ladderContainer.add(rightConn)

      // Wsporniki
      if (connType === 'uchwyt') {
        const wspornikType = connWspornikTypes[pairIndex] || defaultWspornik
        if (wspornikType !== 'none') {
          const customDistance = connWspornikDistances[pairIndex] || wspornikDefaultDistances[wspornikType]
          const defaultDist = wspornikDefaultDistances[wspornikType]
          const distanceOffset = customDistance - defaultDist
          const distanceZOffset = (ladderNum === 1) ? -distanceOffset : distanceOffset

          const leftWspornik = createWspornik(wspornikType, 'left', ladderNum)
          if (leftWspornik) {
            leftWspornik.position.x = (-RAIL_OFFSET + leftWspornik.userData.extraXOffset) * SCALE
            leftWspornik.position.y = (connectionY + leftWspornik.userData.extraYOffset) * SCALE
            leftWspornik.position.z = (connGeoConfig.wspornik.zOffset + connGeoConfig.zOffset + leftWspornik.userData.extraZOffset + distanceZOffset) * SCALE
            leftWspornik.userData.pairIndex = pairIndex
            ladderContainer.add(leftWspornik)
          }

          const rightWspornik = createWspornik(wspornikType, 'right', ladderNum)
          if (rightWspornik) {
            rightWspornik.position.x = (RAIL_OFFSET - rightWspornik.userData.extraXOffset) * SCALE
            rightWspornik.position.y = (connectionY + rightWspornik.userData.extraYOffset) * SCALE
            rightWspornik.position.z = (connGeoConfig.wspornik.zOffset + connGeoConfig.zOffset + rightWspornik.userData.extraZOffset + distanceZOffset) * SCALE
            rightWspornik.userData.pairIndex = pairIndex
            ladderContainer.add(rightWspornik)
          }
        }
      }

      pairIndex++
      currentOffset += SECTION_GAP
    }
  }
}

// ============================================
// RENDER MID-RUNG BRACKETS
// ============================================
function renderMidRungBrackets(laddersToRender: number[], maxHeight: number) {
  for (const bracketLadderNum of laddersToRender) {
    const bracketSections = getLadderSectionsForLadder(bracketLadderNum)
    const midRungBracketEnabled = (bracketLadderNum === 1) ? midRungBracket1 : midRungBracket2
    const midRungBracketHidden = (bracketLadderNum === 1) ? hiddenMidRungBracket1 : false

    const firstSectionHasEnoughRungs = bracketSections.length > 0 &&
      (bracketSections[0].type === 'standard' || bracketSections[0].type === 'alt' ||
       (bracketSections[0].type === 'final' && bracketSections[0].rungs >= 3))

    // Don't render if hidden by collision
    if (midRungBracketEnabled && firstSectionHasEnoughRungs && !midRungBracketHidden) {
      const bracketGeoConfig = ladderGeometryConfig[bracketLadderNum]
      const midRungY = (maxHeight / 2) - 548.5
      const midRungConnType = (bracketLadderNum === 1) ? midRungBracketConnType1 : midRungBracketConnType2

      const leftMidConn = createConnector(midRungConnType, 'left', bracketLadderNum, true)
      leftMidConn.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
      leftMidConn.position.y = midRungY * SCALE
      leftMidConn.position.z = (-62.5 + bracketGeoConfig.zOffset + bracketGeoConfig.connector.uchwytZOffset) * SCALE
      ladderContainer.add(leftMidConn)

      const rightMidConn = createConnector(midRungConnType, 'right', bracketLadderNum, true)
      rightMidConn.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
      rightMidConn.position.y = midRungY * SCALE
      rightMidConn.position.z = (-62.5 + bracketGeoConfig.zOffset + bracketGeoConfig.connector.uchwytZOffset) * SCALE
      ladderContainer.add(rightMidConn)

      // Wsporniki for mid-rung bracket
      const midWspornikType = (bracketLadderNum === 1) ? midRungBracketWspornikType1 : midRungBracketWspornikType2
      const midWspornikDistance = (bracketLadderNum === 1) ? midRungBracketDistance1 : midRungBracketDistance2

      if (midWspornikType !== 'none') {
        const defaultDist = wspornikDefaultDistances[midWspornikType]
        const distanceOffset = midWspornikDistance - defaultDist
        const distanceZOffset = (bracketLadderNum === 1) ? -distanceOffset : distanceOffset

        const leftMidWspornik = createWspornik(midWspornikType, 'left', bracketLadderNum, true)
        if (leftMidWspornik) {
          leftMidWspornik.position.x = (-RAIL_OFFSET + leftMidWspornik.userData.extraXOffset) * SCALE
          leftMidWspornik.position.y = (midRungY + leftMidWspornik.userData.extraYOffset) * SCALE
          leftMidWspornik.position.z = (bracketGeoConfig.wspornik.zOffset + bracketGeoConfig.zOffset + leftMidWspornik.userData.extraZOffset + distanceZOffset) * SCALE
          ladderContainer.add(leftMidWspornik)
        }

        const rightMidWspornik = createWspornik(midWspornikType, 'right', bracketLadderNum, true)
        if (rightMidWspornik) {
          rightMidWspornik.position.x = (RAIL_OFFSET - rightMidWspornik.userData.extraXOffset) * SCALE
          rightMidWspornik.position.y = (midRungY + rightMidWspornik.userData.extraYOffset) * SCALE
          rightMidWspornik.position.z = (bracketGeoConfig.wspornik.zOffset + bracketGeoConfig.zOffset + rightMidWspornik.userData.extraZOffset + distanceZOffset) * SCALE
          ladderContainer.add(rightMidWspornik)
        }
      }
    }
  }
}

// ============================================
// RENDER WALL AND GROUND
// ============================================
function renderWallAndGround(height1: number, _maxHeight: number) {
  const ladderTop = height1 / 2
  
  // topOffset: różnica między górą drabiny a górną krawędzią ściany
  let topOffset = -161  // default (klasyczna)
  if (handrailType === 'platform') {
    topOffset = -211
  } else if (handrailType === 'attic') {
    // attyka: ściana jest 511mm niżej bazowo, minus dystans podest-attyka (przejście wyżej)
    const atticDist = props.atticPlatformDistance ?? 0
    topOffset = -161 + 511 - atticDist
  }
  
  const groundLevel = ladderTop - wallHeightConfig + topOffset

  // Ground
  if (showGround) {
    const wallThickness = 250
    const descentWallDepth = 2000
    // Jeśli jest ściana zejścia, wydłuż podłogę żeby sięgała do jej końca
    const hasDescentWall = props.showDescentWall || handrailType === 'attic'
    const baseGroundDepth = 3000
    const extraDepth = hasDescentWall ? descentWallDepth + wallThickness : 0
    const groundDepth = baseGroundDepth + extraDepth
    const groundGeometry = new THREE.BoxGeometry(wallWidthConfig * SCALE, 50 * SCALE, groundDepth * SCALE)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8c00,
      roughness: 0.7,
      metalness: 0.1
    })
    const groundBar = new THREE.Mesh(groundGeometry, groundMaterial)

    const backOfWall = -(globalWspornikDistance1 + wallThickness + 25)
    // Przesuń środek do tyłu o połowę dodatkowej głębokości
    const groundZ = backOfWall + baseGroundDepth / 2 - extraDepth / 2
    // Offset dla custom-base - podniesienie o 110mm
    const customBaseOffset = props.descentMountType === 'custom-base' ? 0 : 0
    groundBar.position.set(0, (groundLevel + customBaseOffset) * SCALE, groundZ * SCALE)
    groundBar.userData.isGroundIndicator = true
    groundBar.castShadow = true
    groundBar.receiveShadow = true
    ladderContainer.add(groundBar)
  }

  // Wall
  if (showWall && wallHeightConfig > 0) {
    // Grubość ściany - dla attyki używaj prop, inaczej 250mm
    const isAtticPassage = props.scheme === 'attic-passage'
    const wallThickness = isAtticPassage ? (props.atticWallThickness || 250) : 250
    const wallGeometry = new THREE.BoxGeometry(wallWidthConfig * SCALE, wallHeightConfig * SCALE, wallThickness * SCALE)
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4b0,
      roughness: 0.9,
      metalness: 0.0
    })
    const wall = new THREE.Mesh(wallGeometry, wallMaterial)

    const groundThickness = 50
    // Offset dla custom-base - podniesienie o 110mm
    const customBaseOffset = props.descentMountType === 'custom-base' ? 0 : 0
    const wallCenterY = groundLevel + (groundThickness / 2) + wallHeightConfig / 2 + customBaseOffset
    const wallZ = -(globalWspornikDistance1 + (wallThickness / 2) + 33)
    wall.position.set(0, wallCenterY * SCALE, wallZ * SCALE)
    wall.userData.isWallIndicator = true
    wall.receiveShadow = true
    ladderContainer.add(wall)

    // Trzeci box mierzenia na górze ściany (zielony)
    const wallTopY = (wallCenterY + wallHeightConfig / 2) * SCALE
    // Wysokość boxa: 35mm dla attyki, 50mm dla reszty
    const roofBoxHeight = isAtticPassage ? 35 * SCALE : 50 * SCALE
    const roofBoxWidth = 100 * SCALE
    const roofBoxDepth = 100 * SCALE
    const roofBoxZOffset = (334 - 882) * SCALE // Do tyłu o 882mm

    let roofBoxYPos: number
    if (isAtticPassage) {
      // Dla attyki: pozycja przy modelu przełazu attykowego
      // Model przełazu: Y = (totalHeight/2 + DIMS.atticRailHeight/2) * SCALE
      const topOfMainRails = height1 / 2
      const atticModelCenterY = (topOfMainRails + DIMS.atticRailHeight / 2) * SCALE
      // Box przesunięty w dół o 425mm
      roofBoxYPos = atticModelCenterY - 425 * SCALE
    } else {
      // Dół boxa na górze ściany (50mm wyżej dla podestu)
      const platformOffset = handrailType === 'platform' ? 50 * SCALE : 0
      roofBoxYPos = wallTopY + roofBoxHeight / 2 + platformOffset
    }

    const roofMeasureBox = createMeasurementBox(
      roofBoxWidth,
      roofBoxHeight,
      roofBoxDepth,
      new THREE.Vector3(0, roofBoxYPos, roofBoxZOffset),
      0x00ff00 // Zielony
    )
    roofMeasureBox.userData.measurementBoxType = 'roofTop'
    ladderContainer.add(roofMeasureBox)

    // Zapisz pozycję boxa dla wymiaru Dł. Drabiny
    // Dla attyki: GÓRA boxa, dla reszty: DÓŁ boxa
    roofTopBoxY = isAtticPassage
      ? roofBoxYPos + roofBoxHeight / 2
      : roofBoxYPos - roofBoxHeight / 2

    // Box na ścianie bez offsetu podestu (czerwony)
    // Użyj standardowej wysokości 50mm dla czerwonego boxa (nie zależy od attyki)
    const redBoxHeight = 50 * SCALE
    const wallBoxYPos = wallTopY + redBoxHeight / 2  // Bez platformOffset
    const wallMeasureBox = createMeasurementBox(
      roofBoxWidth,
      redBoxHeight,
      roofBoxDepth,
      new THREE.Vector3(0, wallBoxYPos, roofBoxZOffset),
      0xff0000 // Czerwony
    )
    wallMeasureBox.userData.measurementBoxType = 'wallTop'

    // Zapisz DÓŁ czerwonego boxa dla wymiaru zielony → czerwony
    wallTopBoxY = wallTopY
    ladderContainer.add(wallMeasureBox)

    // Box na podłodze (niebieski) - góra boxa = góra podłogi
    const groundTopYCalc = groundLevel * SCALE + 25 * SCALE  // groundLevel + połowa grubości podłogi (50/2)
    const groundBoxYPos = groundTopYCalc - roofBoxHeight / 2  // Góra boxa na górze podłogi
    const groundMeasureBox = createMeasurementBox(
      roofBoxWidth,
      roofBoxHeight,
      roofBoxDepth,
      new THREE.Vector3(0, groundBoxYPos, roofBoxZOffset),
      0x0000ff // Niebieski
    )
    groundMeasureBox.userData.measurementBoxType = 'groundTop'
    ladderContainer.add(groundMeasureBox)

    // Zapisz GÓRĘ niebieskiego boxa dla wymiaru Wys. Kosza
    groundTopBoxY = groundTopYCalc

    // Box na wysokości poręczy asekuracyjnych (pomarańczowy) - dla poręczy lub attyki
    if (handrailType === 'safety' || handrailType === 'platform' || handrailType === 'attic') {
      let handrailTopY: number
      if (handrailType === 'attic') {
        // Dla attyki: góra modelu przełazu attykowego
        const topOfMainRails = height1 / 2
        handrailTopY = (topOfMainRails + DIMS.atticRailHeight) * SCALE
      } else {
        // Góra poręczy = góra drabiny + wysokość poręczy (1011mm)
        handrailTopY = (ladderTop + DIMS.handrailVertical) * SCALE
      }
      // Dół boxa na górze poręczy/przełazu
      const handrailBoxYPos = handrailTopY + roofBoxHeight / 2
      const handrailMeasureBox = createMeasurementBox(
        roofBoxWidth,
        roofBoxHeight,
        roofBoxDepth,
        new THREE.Vector3(0, handrailBoxYPos, roofBoxZOffset),
        0xffa500 // Pomarańczowy
      )
      handrailMeasureBox.userData.measurementBoxType = 'handrailTop'
      ladderContainer.add(handrailMeasureBox)

      // Zapisz DÓŁ pomarańczowego boxa dla wymiaru
      handrailTopBoxY = handrailTopY
    }

    // Insulation layer (semi-transparent)
    // Dla attyki: używaj atticHasInsulation i atticInsulationThickness
    // Dla klasycznej/z podestem: używaj hasInsulation i insulationThickness (lub showInsulation jako fallback)
    let shouldShowInsulation = false
    let insulationThickness = 0

    if (isAtticPassage) {
      shouldShowInsulation = props.atticHasInsulation || false
      insulationThickness = props.atticInsulationThickness || 100
    } else {
      // Dla klasycznej/z podestem - sprawdź najpierw nowe props
      if (props.hasInsulation && props.insulationThickness) {
        shouldShowInsulation = true
        insulationThickness = props.insulationThickness
      } else if (showInsulation) {
        // Fallback - z przycisku widoczności i typu wspornika
        shouldShowInsulation = true
        if (defaultWspornik1 === 'krotki') {
          insulationThickness = 50   // 5cm dla krótkich
        } else if (defaultWspornik1 === 'sredni') {
          insulationThickness = 100  // 10cm dla średnich
        } else if (defaultWspornik1 === 'dlugi') {
          insulationThickness = 200  // 20cm dla długich
        }
      }
    }

    if (shouldShowInsulation && insulationThickness > 0) {
        // If there's an eave, reduce insulation height from top
        const eaveHeight = props.eave ? props.eave.height : 0
        const insulationHeight = wallHeightConfig - eaveHeight
        const insulationCenterY = wallCenterY - eaveHeight / 2

        const insulationGeometry = new THREE.BoxGeometry(
          wallWidthConfig * SCALE,
          insulationHeight * SCALE,
          insulationThickness * SCALE
        )
        const insulationMaterial = new THREE.MeshStandardMaterial({
          color: 0xffcc00,  // Yellow/orange for styrofoam
          roughness: 0.8,
          metalness: 0.0,
          transparent: true,
          opacity: 0.25,
          depthWrite: false  // Better transparency rendering
        })
        const insulation = new THREE.Mesh(insulationGeometry, insulationMaterial)

        // Position in front of wall
        const frontOfWall = wallZ + wallThickness / 2
        const insulationZ = frontOfWall + insulationThickness / 2
        insulation.position.set(0, insulationCenterY * SCALE, insulationZ * SCALE)
        insulation.userData.isInsulation = true
        ladderContainer.add(insulation)
    }

    // Eave (okap) - only for classic and platform schemes
    if (props.eave && (handrailType === 'none' || handrailType === 'safety' || handrailType === 'platform')) {
      const eaveHeight = props.eave.height  // mm
      const eaveDepth = props.eave.depth    // mm
      const eaveWidth = wallWidthConfig     // Same as wall width

      const eaveGeometry = new THREE.BoxGeometry(
        eaveWidth * SCALE,
        eaveHeight * SCALE,
        eaveDepth * SCALE
      )
      const eaveMaterial = new THREE.MeshStandardMaterial({
        color: 0x9a9a9a,  // Light gray color
        roughness: 0.7,
        metalness: 0.2
      })
      const eave = new THREE.Mesh(eaveGeometry, eaveMaterial)

      // Position at top of wall, eave goes DOWN by its height
      const eaveY = wallCenterY + wallHeightConfig / 2 - eaveHeight / 2
      const frontOfWall = wallZ + wallThickness / 2
      const eaveZ = frontOfWall + eaveDepth / 2

      eave.position.set(0, eaveY * SCALE, eaveZ * SCALE)
      eave.userData.isEave = true
      eave.castShadow = true
      eave.receiveShadow = true
      ladderContainer.add(eave)
    }

    // Ściana strony zejścia (attyka) - po drugiej stronie głównej ściany
    // Wysokość = główna ściana - wartość wpisana przez użytkownika
    // Renderuj dla attic-passage LUB gdy showDescentWall jest ustawione (płaski dach/okap)
    if ((handrailType === 'attic' || props.showDescentWall) && props.atticWallHeight !== undefined) {
      // Wysokość ściany zejścia = główna ściana - atticWallHeight
      const descentWallHeight = wallHeightConfig - props.atticWallHeight  // mm

      // Renderuj tylko jeśli ściana zejścia ma dodatnią wysokość
      if (descentWallHeight > 0) {
        const descentWallDepth = 2000  // 2 metry w tył
        const descentWallGeometry = new THREE.BoxGeometry(
          wallWidthConfig * SCALE,
          descentWallHeight * SCALE,
          descentWallDepth * SCALE
        )
        const descentWallMaterial = new THREE.MeshStandardMaterial({
          color: 0xc4b4a0,  // Slightly different shade
          roughness: 0.9,
          metalness: 0.0
        })
        const descentWall = new THREE.Mesh(descentWallGeometry, descentWallMaterial)

        // Pozycja: za główną ścianą (Z ujemne = dalej od drabiny)
        const groundThickness = 50
        // Offset dla custom-base - podniesienie o 110mm
        const customBaseOffset = props.descentMountType === 'custom-base' ? 0 : 0
        const descentWallCenterY = groundLevel + (groundThickness / 2) + descentWallHeight / 2 + customBaseOffset
        const descentWallZ = wallZ - wallThickness / 2 - descentWallDepth / 2  // Za główną ścianą
        descentWall.position.set(0, descentWallCenterY * SCALE, descentWallZ * SCALE)
        descentWall.userData.isDescentWall = true
        descentWall.receiveShadow = true
        ladderContainer.add(descentWall)

        // Box pomiarowy na górze ściany zejścia (fioletowy)
        const descentWallTop = (groundLevel + groundThickness / 2 + descentWallHeight) * SCALE
        const descentBoxHeight = 50 * SCALE
        const descentBoxWidth = 100 * SCALE
        const descentBoxDepth = 100 * SCALE
        const descentBoxYPos = descentWallTop + descentBoxHeight / 2  // Dół boxa na górze ściany
        const descentBoxZOffset = descentWallZ * SCALE  // Przy ścianie zejścia
        const descentMeasureBox = createMeasurementBox(
          descentBoxWidth,
          descentBoxHeight,
          descentBoxDepth,
          new THREE.Vector3(0, descentBoxYPos, descentBoxZOffset),
          0x9932cc // Fioletowy
        )
        descentMeasureBox.userData.measurementBoxType = 'descentWallTop'
        ladderContainer.add(descentMeasureBox)

        // Zapisz GÓRĘ ściany zejścia (dół fioletowego boxa)
        descentWallTopBoxY = descentWallTop

        // Ocieplenie po drugiej stronie ściany (strona zejścia)
        // Wysokość = wysokość ściany strona zejścia (atticWallHeight - wartość wpisana przez użytkownika)
        if (props.atticBackHasInsulation && props.atticBackInsulationThickness) {
          const backInsulationThickness = props.atticBackInsulationThickness
          const backInsulationHeight = props.atticWallHeight || descentWallHeight  // użyj faktycznej wysokości ściany zejścia
          const backInsulationGeometry = new THREE.BoxGeometry(
            wallWidthConfig * SCALE,
            backInsulationHeight * SCALE,
            backInsulationThickness * SCALE
          )
          const backInsulationMaterial = new THREE.MeshStandardMaterial({
            color: 0xffcc00,  // Yellow/orange for styrofoam
            roughness: 0.8,
            metalness: 0.0,
            transparent: true,
            opacity: 0.25,
            depthWrite: false
          })
          const backInsulation = new THREE.Mesh(backInsulationGeometry, backInsulationMaterial)

          // Pozycja: za główną ścianą, od góry ściany w dół
          const backOfMainWall = wallZ - wallThickness / 2
          const backInsulationZ = backOfMainWall - backInsulationThickness / 2
          // Y: góra ściany - połowa wysokości ocieplenia
          const wallTopY = wallCenterY + wallHeightConfig / 2
          const backInsulationY = wallTopY - backInsulationHeight / 2
          backInsulation.position.set(0, backInsulationY * SCALE, backInsulationZ * SCALE)
          backInsulation.userData.isBackInsulation = true
          ladderContainer.add(backInsulation)
        }
      }
    }
  }
}

// ============================================
// POSITION LADDER
// ============================================
function positionLadder(height1: number, _maxHeight: number) {
  const ladderTop = height1 / 2
  
  // topOffset: różnica między górą drabiny a górną krawędzią ściany
  let topOffset = -161  // default (klasyczna)
  if (handrailType === 'platform') {
    topOffset = -211
  } else if (handrailType === 'attic') {
    // attyka: bazowy offset + dystans podest-attyka (podniesienie przełazu)
    const atticDist = props.atticPlatformDistance ?? 0
    topOffset = -161 + 511 - atticDist
  }
  
  const groundLevel = ladderTop - wallHeightConfig + topOffset

  ladderContainer.position.y = (-groundLevel + suspendedHeight1) * SCALE
}

// ============================================
// EMIT UPDATE
// ============================================
function emitUpdate() {
  const totalRungs = numX7Ladders1 * 7 + (typeof finalLadderRungs1 === 'number' ? finalLadderRungs1 : 7)
  const totalHeightMm = getTotalHeightForLadder(1)

  // Calculate last rung to ground distance
  const distFromGround = props.distanceFromGround || 160
  let lastRungToGround: number
  if (handrailType === 'attic') {
    // Dla przejścia przez attykę - używamy wartości z App.vue (już obliczone)
    lastRungToGround = distFromGround
  } else {
    // Dla klasycznej i z podestem: standardowa formuła
    lastRungToGround = distFromGround + suspendedHeight1
  }

  // Calculate last hoop to ground distance
  let lastHoopToGround = 0
  if (safetyCageCount1 > 0) {
    const height1 = getTotalHeightForLadder(1)
    const hoopSpacing = 641.7

    let topPosition = height1 / 2
    let firstHoopOffset: number

    if (handrailType === 'safety' || handrailType === 'platform') {
      topPosition += DIMS.handrailVertical
      firstHoopOffset = 25
    } else if (handrailType === 'attic') {
      topPosition += DIMS.atticRailHeight
      firstHoopOffset = 25
    } else {
      firstHoopOffset = 294.3
    }

    // Last hoop Y position (relative to ladder center) - measure to BOTTOM of hoop
    const hoopHeight = 45  // height of hoop band in mm
    const lastHoopY = topPosition - firstHoopOffset - ((safetyCageCount1 - 1) * hoopSpacing) - hoopHeight

    // Ground level - same formula as renderWallAndGround
    const ladderTop = height1 / 2
    let topOffset = -161
    if (handrailType === 'platform') {
      topOffset = -211
    } else if (handrailType === 'attic') {
      const atticDist = props.atticPlatformDistance ?? 0
      topOffset = -161 + 511 - atticDist
    }
    const groundLevel = ladderTop - wallHeightConfig + topOffset

    // Distance from last hoop bottom to ground (absolute - groundLevel already accounts for suspension)
    lastHoopToGround = Math.round(lastHoopY - groundLevel)
  }

  // Assign element IDs to all objects (for delete/hide functionality)
  assignElementIds()

  // Apply hidden elements before generating BOM
  applyHiddenElements()

  // Generate BOM from actual 3D scene (will skip hidden elements)
  const bomData = generateBOM()

  emit('update', {
    totalRungs,
    totalHeightMm,
    safetyCageCount: safetyCageCount1,
    connectorTypes: connectorTypes1.slice(),
    wspornikTypes: wspornikTypes1.slice(),
    sciskaneHandles: sciskaneHandles1.map(h => ({
      offsetFromBottom: h.offsetFromBottom,
      connType: h.connType
    })),
    lastRungToGround: Math.round(lastRungToGround),
    lastHoopToGround,
    bomData
  })

  // Re-center camera in tech drawing mode after model update
  if (isTechDrawingMode) {
    enterTechDrawingMode(techDrawingView)
  }

  requestRender() // Render after model update
}

// ============================================
// ANIMATION (custom camera control with on-demand rendering)
// ============================================

// Request a single render frame
function requestRender() {
  scheduleFrame()
}

// Schedule next animation frame if not already scheduled
function scheduleFrame() {
  if (!animationFrameId && !isDisposed) {
    animationFrameId = requestAnimationFrame(animate)
  }
}

// Start continuous animation (for smooth interpolation)
function startAnimation() {
  isAnimating = true
  scheduleFrame()
}

function animate() {
  if (isDisposed) {
    animationFrameId = null
    return
  }

  animationFrameId = null

  // In tech drawing mode, don't modify camera/rotation
  if (!isTechDrawingMode) {
    // Smooth rotation interpolation
    const dx = targetRotation.x - currentRotation.x
    const dy = targetRotation.y - currentRotation.y

    currentRotation.x += dx * 0.1
    currentRotation.y += dy * 0.1

    // Check if animation is done (within epsilon)
    const epsilon = 0.0001
    isAnimating = (Math.abs(dx) > epsilon || Math.abs(dy) > epsilon)

    // Move ladder inside pivot - pivot point follows camera
    ladderContainer.position.y = -cameraOffset.y
    // For attic, offset pivot back by 51cm (510mm)
    const atticZOffset = (handrailType === 'attic') ? 510 * SCALE : 0
    ladderContainer.position.z = -cameraOffset.z + atticZOffset

    // Apply rotation to pivot group
    pivotGroup.rotation.x = currentRotation.x
    pivotGroup.rotation.y = currentRotation.y

    // Apply camera X offset
    perspectiveCamera.position.x = cameraOffset.x
    perspectiveCamera.position.y = 0
    perspectiveCamera.lookAt(cameraOffset.x, 0, 0)
  }

  // Skaluj measurement label wraz z odległością kamery / zoom
  if (measurementLabel && measurementLabel.visible) {
    const baseScale = 0.5
    let scaleFactor: number

    if (isTechDrawingMode && orthoCamera) {
      // Tryb rysunku technicznego - skaluj przez rozmiar widoku ortho (top - bottom)
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie w przód przy oddaleniu (bazowy zoom ~20, max ~300)
      // Im większy viewHeight, tym bardziej do przodu
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      const zOffset = zoomDiff * 0.03  // Przesunięcie w przód proporcjonalne do oddalenia

      // Aktualizuj pozycję Z (przesuń w przód = zwiększ Z)
      if (measurementLabel.userData.baseZ === undefined) {
        measurementLabel.userData.baseZ = measurementLabel.position.z
      }
      measurementLabel.position.z = measurementLabel.userData.baseZ + zOffset
    } else {
      // Tryb perspektywiczny - skaluj przez odległość kamery
      const labelWorldPos = new THREE.Vector3()
      measurementLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    measurementLabel.scale.set(baseScale * scaleFactor, baseScale * 4 * scaleFactor, 1)
  }

  // Skaluj ladder length label wraz z odległością kamery / zoom
  if (ladderLengthLabel && ladderLengthLabel.visible) {
    const baseScale = 0.7
    let scaleFactor: number
    const isFrontSide = ladderLengthLabel.userData.frontSide === true

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie przy oddaleniu
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      // Różne współczynniki dla wymiaru (linia/dyski) i napisu
      const zOffsetDimension = zoomDiff * 0.04  // Dla wymiaru
      const zOffsetLabel = zoomDiff * 0.06      // Większy dla napisu

      // Aktualizuj pozycję Z napisu
      if (ladderLengthLabel.userData.baseZ === undefined) {
        ladderLengthLabel.userData.baseZ = ladderLengthLabel.position.z
      }
      // Front: przesuń w przód (+), Tył: przesuń w tył (-)
      ladderLengthLabel.position.z = ladderLengthLabel.userData.baseZ + (isFrontSide ? zOffsetLabel : -zOffsetLabel)

      // Dla frontSide: przesuń też linię i dyski (mniejszy współczynnik)
      if (isFrontSide) {
        if (ladderLengthLine) {
          if (ladderLengthLine.userData.baseZ === undefined) {
            ladderLengthLine.userData.baseZ = ladderLengthLine.position.z
          }
          ladderLengthLine.position.z = ladderLengthLine.userData.baseZ + zOffsetDimension
        }
        if (ladderLengthDiskTop) {
          if (ladderLengthDiskTop.userData.baseZ === undefined) {
            ladderLengthDiskTop.userData.baseZ = ladderLengthDiskTop.position.z
          }
          ladderLengthDiskTop.position.z = ladderLengthDiskTop.userData.baseZ + zOffsetDimension
        }
        if (ladderLengthDiskBottom) {
          if (ladderLengthDiskBottom.userData.baseZ === undefined) {
            ladderLengthDiskBottom.userData.baseZ = ladderLengthDiskBottom.position.z
          }
          ladderLengthDiskBottom.position.z = ladderLengthDiskBottom.userData.baseZ + zOffsetDimension
        }
      }
    } else {
      const labelWorldPos = new THREE.Vector3()
      ladderLengthLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    ladderLengthLabel.scale.set(baseScale * scaleFactor * 2.0, baseScale * 4.8 * scaleFactor, 1)
  }

  // Skaluj cage height label wraz z odległością kamery / zoom
  if (cageHeightLabel && cageHeightLabel.visible) {
    const baseScale = 0.5
    let scaleFactor: number

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie w przód przy oddaleniu (tak samo jak wymiar kosza)
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      const zOffset = zoomDiff * 0.03

      if (cageHeightLabel.userData.baseZ === undefined) {
        cageHeightLabel.userData.baseZ = cageHeightLabel.position.z
      }
      cageHeightLabel.position.z = cageHeightLabel.userData.baseZ + zOffset
    } else {
      const labelWorldPos = new THREE.Vector3()
      cageHeightLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    cageHeightLabel.scale.set(baseScale * scaleFactor, baseScale * 4 * scaleFactor, 1)
  }

  // Skaluj handrail height label wraz z odległością kamery / zoom (tak samo jak dł. drabiny)
  if (handrailHeightLabel && handrailHeightLabel.visible) {
    const baseScale = 0.7
    let scaleFactor: number
    const isFrontSide = handrailHeightLabel.userData.frontSide === true

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie przy oddaleniu
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      // Różne współczynniki dla wymiaru (linia/dyski) i napisu
      const zOffsetDimension = zoomDiff * 0.04  // Dla wymiaru
      const zOffsetLabel = zoomDiff * 0.06      // Większy dla napisu

      // Aktualizuj pozycję Z napisu
      if (handrailHeightLabel.userData.baseZ === undefined) {
        handrailHeightLabel.userData.baseZ = handrailHeightLabel.position.z
      }
      // Front: przesuń w przód (+), Tył: przesuń w tył (-)
      handrailHeightLabel.position.z = handrailHeightLabel.userData.baseZ + (isFrontSide ? zOffsetLabel : -zOffsetLabel)

      // Dla frontSide: przesuń też linię i dyski (mniejszy współczynnik)
      if (isFrontSide) {
        if (handrailHeightLine) {
          if (handrailHeightLine.userData.baseZ === undefined) {
            handrailHeightLine.userData.baseZ = handrailHeightLine.position.z
          }
          handrailHeightLine.position.z = handrailHeightLine.userData.baseZ + zOffsetDimension
        }
        if (handrailHeightDiskTop) {
          if (handrailHeightDiskTop.userData.baseZ === undefined) {
            handrailHeightDiskTop.userData.baseZ = handrailHeightDiskTop.position.z
          }
          handrailHeightDiskTop.position.z = handrailHeightDiskTop.userData.baseZ + zOffsetDimension
        }
        if (handrailHeightDiskBottom) {
          if (handrailHeightDiskBottom.userData.baseZ === undefined) {
            handrailHeightDiskBottom.userData.baseZ = handrailHeightDiskBottom.position.z
          }
          handrailHeightDiskBottom.position.z = handrailHeightDiskBottom.userData.baseZ + zOffsetDimension
        }
      }
    } else {
      const labelWorldPos = new THREE.Vector3()
      handrailHeightLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    handrailHeightLabel.scale.set(baseScale * scaleFactor * 2.0, baseScale * 4.8 * scaleFactor, 1)
  }

  // Skaluj info label wraz z odległością kamery / zoom (tak samo jak attic info label)
  if (infoLabel && infoLabel.visible) {
    const baseScale = 1.0
    let scaleFactor: number

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie przy oddaleniu (jak attic info label)
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      const zOffsetLabel = zoomDiff * 0.2

      if (infoLabel.userData.baseZ === undefined) {
        infoLabel.userData.baseZ = infoLabel.position.z
      }
      infoLabel.position.z = infoLabel.userData.baseZ + zOffsetLabel
    } else {
      const labelWorldPos = new THREE.Vector3()
      infoLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    const baseScaleY = infoLabel.userData.baseScaleY || 2.0
    infoLabel.scale.set(baseScale * scaleFactor * 8.0, baseScale * scaleFactor * baseScaleY, 1)
  }

  // Skaluj attic info label (tak samo jak dł. drabiny frontSide)
  if (atticInfoLabel && atticInfoLabel.visible) {
    const baseScale = 1.0
    let scaleFactor: number

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie przy oddaleniu
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      const zOffsetLabel = zoomDiff * 0.2

      if (atticInfoLabel.userData.baseZ === undefined) {
        atticInfoLabel.userData.baseZ = atticInfoLabel.position.z
      }
      atticInfoLabel.position.z = atticInfoLabel.userData.baseZ + zOffsetLabel
    } else {
      const labelWorldPos = new THREE.Vector3()
      atticInfoLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    const baseScaleY = atticInfoLabel.userData.baseScaleY || 6.0
    atticInfoLabel.scale.set(baseScale * scaleFactor * 8.0, baseScale * scaleFactor * baseScaleY, 1)
  }

  // Skaluj suspension height label wraz z odległością kamery / zoom (tak samo jak dł. drabiny)
  if (suspensionHeightLabel && suspensionHeightLabel.visible) {
    const baseScale = 0.7
    let scaleFactor: number
    const isFrontSide = suspensionHeightLabel.userData.frontSide === true

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie przy oddaleniu
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      // Różne współczynniki dla wymiaru (linia/dyski) i napisu
      const zOffsetDimension = zoomDiff * 0.04  // Dla wymiaru
      const zOffsetLabel = zoomDiff * 0.06      // Większy dla napisu

      // Aktualizuj pozycję Z napisu
      if (suspensionHeightLabel.userData.baseZ === undefined) {
        suspensionHeightLabel.userData.baseZ = suspensionHeightLabel.position.z
      }
      // Front: przesuń w przód (+), Tył: przesuń w tył (-)
      suspensionHeightLabel.position.z = suspensionHeightLabel.userData.baseZ + (isFrontSide ? zOffsetLabel : -zOffsetLabel)

      // Dla frontSide: przesuń też linię i dyski (mniejszy współczynnik)
      if (isFrontSide) {
        if (suspensionHeightLine) {
          if (suspensionHeightLine.userData.baseZ === undefined) {
            suspensionHeightLine.userData.baseZ = suspensionHeightLine.position.z
          }
          suspensionHeightLine.position.z = suspensionHeightLine.userData.baseZ + zOffsetDimension
        }
        if (suspensionHeightDiskTop) {
          if (suspensionHeightDiskTop.userData.baseZ === undefined) {
            suspensionHeightDiskTop.userData.baseZ = suspensionHeightDiskTop.position.z
          }
          suspensionHeightDiskTop.position.z = suspensionHeightDiskTop.userData.baseZ + zOffsetDimension
        }
        if (suspensionHeightDiskBottom) {
          if (suspensionHeightDiskBottom.userData.baseZ === undefined) {
            suspensionHeightDiskBottom.userData.baseZ = suspensionHeightDiskBottom.position.z
          }
          suspensionHeightDiskBottom.position.z = suspensionHeightDiskBottom.userData.baseZ + zOffsetDimension
        }
      }
    } else {
      const labelWorldPos = new THREE.Vector3()
      suspensionHeightLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    suspensionHeightLabel.scale.set(baseScale * scaleFactor * 2.0, baseScale * 4.8 * scaleFactor, 1)
  }

  // Green-red label - stała skala, bez skalowania dynamicznego
  // (skala ustawiona w drawGreenRedDimension)

  // Skaluj descent ladder length label (jak klasyczna dł. drabiny z tyłu)
  if (descentLadderLengthLabel && descentLadderLengthLabel.visible) {
    const baseScale = 0.7
    let scaleFactor: number

    if (isTechDrawingMode && orthoCamera) {
      const viewHeight = orthoCamera.top - orthoCamera.bottom
      scaleFactor = viewHeight * 0.05

      // Dynamiczne przesunięcie przy oddaleniu (w tył)
      const baseZoomLevel = 20
      const zoomDiff = Math.max(0, viewHeight - baseZoomLevel)
      const zOffsetLabel = zoomDiff * 0.03

      if (descentLadderLengthLabel.userData.baseZ === undefined) {
        descentLadderLengthLabel.userData.baseZ = descentLadderLengthLabel.position.z
      }
      descentLadderLengthLabel.position.z = descentLadderLengthLabel.userData.baseZ - zOffsetLabel
    } else {
      const labelWorldPos = new THREE.Vector3()
      descentLadderLengthLabel.getWorldPosition(labelWorldPos)
      const cameraDistance = camera.position.distanceTo(labelWorldPos)
      scaleFactor = cameraDistance * 0.08
    }

    descentLadderLengthLabel.scale.set(baseScale * scaleFactor * 2.0, baseScale * 4.8 * scaleFactor, 1)
  }

  // Render the frame
  renderer.render(scene, camera)

  // Continue animation loop while interacting or smoothly interpolating
  if (isAnimating || isDragging || isPanning) {
    animationFrameId = requestAnimationFrame(animate)
  }
}

function handleResize() {
  if (!containerRef.value || isDisposed) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  const aspect = width / height

  // Update perspective camera
  perspectiveCamera.aspect = aspect
  perspectiveCamera.updateProjectionMatrix()

  // Update orthographic camera
  const orthoSize = orthoCamera.top
  orthoCamera.left = -orthoSize * aspect
  orthoCamera.right = orthoSize * aspect
  orthoCamera.updateProjectionMatrix()

  renderer.setSize(width, height)
  requestRender() // Render after resize
}

// ============================================
// MEASUREMENT FUNCTIONS
// ============================================

// Snap distance - delikatne przyciąganie
const SNAP_DISTANCE = 0.03  // W jednostkach sceny (małe, delikatne)

function createMeasureSphere(worldPoint: THREE.Vector3, isPreview: boolean = false): THREE.Mesh {
  // Dynamiczny rozmiar sfery zależny od odległości kamery
  const cameraDistance = camera.position.distanceTo(worldPoint)
  let sphereRadius = cameraDistance * 0.008
  sphereRadius = Math.max(sphereRadius, 0.01)
  sphereRadius = Math.min(sphereRadius, 0.08)

  const geometry = new THREE.SphereGeometry(sphereRadius, 16, 16)
  const material = new THREE.MeshBasicMaterial({
    color: isPreview ? 0xffff00 : 0x00ff00,
    transparent: isPreview,
    opacity: isPreview ? 0.5 : 1.0
  })
  const sphere = new THREE.Mesh(geometry, material)

  const localPoint = ladderContainer.worldToLocal(worldPoint.clone())
  sphere.position.copy(localPoint)
  sphere.userData.isMeasureObject = true
  ladderContainer.add(sphere)
  return sphere
}

function clearMeasurePreview() {
  if (measurePreviewSphere) {
    ladderContainer.remove(measurePreviewSphere)
    measurePreviewSphere.geometry.dispose()
    ;(measurePreviewSphere.material as THREE.Material).dispose()
    measurePreviewSphere = null
  }
}

function clearMeasureLine() {
  if (measureLine) {
    ladderContainer.remove(measureLine)
    measureLine.geometry.dispose()
    measureLine = null
  }
  if (measureSphere1) {
    ladderContainer.remove(measureSphere1)
    measureSphere1.geometry.dispose()
    ;(measureSphere1.material as THREE.Material).dispose()
    measureSphere1 = null
  }
  if (measureSphere2) {
    ladderContainer.remove(measureSphere2)
    measureSphere2.geometry.dispose()
    ;(measureSphere2.material as THREE.Material).dispose()
    measureSphere2 = null
  }
}


// Szukaj snap point tylko na trafioym obiekcie (nie na wszystkich)
function findSnapPoint(worldPoint: THREE.Vector3, hitObject: THREE.Object3D): THREE.Vector3 | null {
  // Znajdź mesh
  let mesh: THREE.Mesh | null = null
  if (hitObject instanceof THREE.Mesh) {
    mesh = hitObject
  } else {
    hitObject.traverse((child) => {
      if (!mesh && child instanceof THREE.Mesh) mesh = child
    })
  }

  if (!mesh || !mesh.geometry) return null

  const geometry = mesh.geometry
  const positionAttr = geometry.getAttribute('position')
  if (!positionAttr) return null

  const localPoint = mesh.worldToLocal(worldPoint.clone())
  let closestPoint: THREE.Vector3 | null = null
  let closestDist = SNAP_DISTANCE

  // Sprawdź wierzchołki
  const tempVec = new THREE.Vector3()
  for (let i = 0; i < positionAttr.count; i++) {
    tempVec.fromBufferAttribute(positionAttr, i)
    const dist = tempVec.distanceTo(localPoint)
    if (dist < closestDist) {
      closestDist = dist
      closestPoint = mesh.localToWorld(tempVec.clone())
    }
  }

  return closestPoint
}

function updateMeasurePreview(clientX: number, clientY: number) {
  if (!measureMode || !raycaster || !renderer) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(ladderContainer.children, true)

  // Znajdź pierwszy ważny intersect (pomiń obiekty pomiarowe i debug)
  let validIntersect: THREE.Intersection | null = null
  for (const intersect of intersects) {
    const obj = intersect.object
    if (obj.userData.isMeasureObject) continue
    if (!obj.visible) continue

    // Pomiń boxy mierzenia tylko gdy debug mode OFF
    if (!showMeasurementBoxes && obj.userData.isMeasurementBox) continue

    // Pomiń obiekty z opacity 0
    if ((obj as THREE.Mesh).material) {
      const mat = (obj as THREE.Mesh).material
      if (!Array.isArray(mat) && (mat as THREE.MeshBasicMaterial).opacity === 0) continue
    }

    // Sprawdź flagi debug w hierarchii
    let isDebug = false
    let checkObj: THREE.Object3D | null = obj
    while (checkObj) {
      if (checkObj.userData.isGreenCollisionBox ||
          checkObj.userData.isCollisionZone ||
          checkObj.userData.isMidRungBox ||
          checkObj.userData.isSciskaneBox ||
          (!showMeasurementBoxes && checkObj.userData.isMeasurementBox) ||
          greenCollisionBoxes.includes(checkObj)) {
        isDebug = true
        break
      }
      checkObj = checkObj.parent
    }
    if (isDebug) continue

    validIntersect = intersect
    break
  }

  if (validIntersect) {
    // Spróbuj snap do wierzchołka (delikatne)
    const snapPoint = findSnapPoint(validIntersect.point, validIntersect.object)
    const finalPoint = snapPoint || validIntersect.point
    const isSnapped = !!snapPoint

    // Aktualizuj lub utwórz preview sphere
    if (!measurePreviewSphere) {
      measurePreviewSphere = createMeasureSphere(finalPoint, true)
    } else {
      // Aktualizuj pozycję
      const localPoint = ladderContainer.worldToLocal(finalPoint.clone())
      measurePreviewSphere.position.copy(localPoint)

      // Aktualizuj rozmiar
      const cameraDistance = camera.position.distanceTo(finalPoint)
      let sphereRadius = cameraDistance * 0.008
      sphereRadius = Math.max(sphereRadius, 0.01)
      sphereRadius = Math.min(sphereRadius, 0.08)
      measurePreviewSphere.geometry.dispose()
      measurePreviewSphere.geometry = new THREE.SphereGeometry(sphereRadius, 16, 16)

      // Kolor: zielony gdy snap, żółty gdy nie
      const mat = measurePreviewSphere.material as THREE.MeshBasicMaterial
      mat.color.setHex(isSnapped ? 0x00ff00 : 0xffff00)
    }
  } else {
    clearMeasurePreview()
  }
}

function addMeasurePoint(worldPoint: THREE.Vector3) {
  clearMeasurePreview()

  // Convert world coordinates to local ladderContainer coordinates
  const localPoint = ladderContainer.worldToLocal(worldPoint.clone())

  if (!measurePoint1) {
    clearMeasureLine()
    measurePoint1 = localPoint.clone()
    measureSphere1 = createMeasureSphere(worldPoint, false)
  } else {
    measurePoint2 = localPoint.clone()
    measureSphere2 = createMeasureSphere(worldPoint, false)

    // Calculate distance based on mode
    let distance: number
    let lineEndPoint: THREE.Vector3
    let axisLabel = ''

    if (measureAxisMode === 'x') {
      distance = Math.abs(measurePoint2.x - measurePoint1.x)
      lineEndPoint = new THREE.Vector3(measurePoint2.x, measurePoint1.y, measurePoint1.z)
      axisLabel = 'X'
    } else if (measureAxisMode === 'y') {
      distance = Math.abs(measurePoint2.y - measurePoint1.y)
      lineEndPoint = new THREE.Vector3(measurePoint1.x, measurePoint2.y, measurePoint1.z)
      axisLabel = 'Y'
    } else if (measureAxisMode === 'z') {
      distance = Math.abs(measurePoint2.z - measurePoint1.z)
      lineEndPoint = new THREE.Vector3(measurePoint1.x, measurePoint1.y, measurePoint2.z)
      axisLabel = 'Z'
    } else {
      distance = measurePoint1.distanceTo(measurePoint2)
      lineEndPoint = measurePoint2.clone()
      axisLabel = '3D'
    }

    const distanceMm = Math.round(distance / SCALE)

    // Draw line between points
    const lineColor = measureAxisMode === 'x' ? 0xff0000 :
                      measureAxisMode === 'y' ? 0x00ff00 :
                      measureAxisMode === 'z' ? 0x0000ff : 0x00ff00
    const geometry = new THREE.BufferGeometry().setFromPoints([measurePoint1, lineEndPoint])
    const material = new THREE.LineBasicMaterial({ color: lineColor })
    measureLine = new THREE.Line(geometry, material)
    measureLine.userData.isMeasureObject = true
    ladderContainer.add(measureLine)

    // Emit result
    emit('measureResult', {
      distanceMm,
      axisMode: axisLabel
    })

    // Reset for next measurement
    measurePoint1 = null
    measurePoint2 = null
  }
}

function setMeasureMode(enabled: boolean) {
  measureMode = enabled
  if (!enabled) {
    clearMeasurePreview()
    clearMeasureLine()
    measurePoint1 = null
    measurePoint2 = null
  }
}

function setMeasureAxisMode(mode: '3d' | 'x' | 'y' | 'z') {
  measureAxisMode = mode
}

// ============================================
// DELETE MODE FUNCTIONS (for seller mode)
// ============================================
function setDeleteMode(enabled: boolean) {
  deleteMode = enabled
  if (!enabled) {
    clearDeleteHighlight()
  }
  requestRender()
}

function findDeletableParent(obj: THREE.Object3D): THREE.Object3D | null {
  let current: THREE.Object3D | null = obj
  let candidateWithoutId: THREE.Object3D | null = null

  while (current && current !== ladderContainer) {
    // Check if this object has deletable flags
    const isDeletable = current.userData.isDeletable ||
        current.userData.isLadderModule ||
        current.userData.isSafetyCage ||
        current.userData.isCageHoop ||
        current.userData.isConnector ||
        current.userData.isWspornik ||
        current.userData.isHandrail ||
        current.userData.isPlatform ||
        current.userData.isAngleBracket ||
        current.userData.isSciskaneHandle ||
        current.userData.isSciskanePlaced ||
        current.userData.isSciskaneWspornik

    if (isDeletable) {
      // Prefer element with elementId
      if (current.userData.elementId) {
        return current
      }
      // Store candidate without ID, keep searching up
      if (!candidateWithoutId) {
        candidateWithoutId = current
      }
    }

    // Check by name patterns
    const name = current.name?.toLowerCase() || ''
    const matchesName = name.includes('cage') ||
        name.includes('hoop') ||
        name.includes('wspornik') ||
        name.includes('bracket') ||
        name.includes('connector') ||
        name.includes('handrail') ||
        name.includes('platform') ||
        name.includes('ladder') ||
        name.includes('katownik') ||
        name.includes('sciskane') ||
        name.includes('uchwyt')

    if (matchesName) {
      // Prefer element with elementId
      if (current.userData.elementId) {
        return current
      }
      if (!candidateWithoutId) {
        candidateWithoutId = current
      }
    }

    current = current.parent
  }

  // Return candidate without ID as fallback
  return candidateWithoutId
}

function getElementInfo(obj: THREE.Object3D): { name: string; type: string } {
  const userData = obj.userData || {}
  const objName = obj.name?.toLowerCase() || ''

  // Determine type and name based on userData or object name
  // Check isSafetyCage first (for cage hoops)
  if (userData.isSafetyCage || userData.isCageHoop || objName.includes('hoop')) {
    return { name: 'Obręcz kosza bezpieczeństwa', type: 'cage_hoop' }
  }
  // Check angle brackets (kątowniki)
  if (userData.isAngleBracket || objName.includes('katownik')) {
    const segments = userData.segments || 2
    return { name: `Kątownik kosza x${segments}`, type: 'angle_bracket' }
  }
  // Check sciskane handles (ściskany/uchwyty)
  if (userData.isSciskaneHandle || userData.isSciskanePlaced) {
    return { name: 'Uchwyt ściskany', type: 'sciskane_handle' }
  }
  // Check sciskane wsporniki
  if (userData.isSciskaneWspornik) {
    return { name: 'Wspornik ściskany', type: 'sciskane_wspornik' }
  }
  if (userData.isWspornik || objName.includes('wspornik') || objName.includes('bracket')) {
    return { name: 'Wspornik', type: 'wspornik' }
  }
  if (userData.isConnector || objName.includes('connector')) {
    return { name: 'Łącznik', type: 'connector' }
  }
  if (userData.isHandrail || objName.includes('handrail')) {
    return { name: 'Poręcz asekuracyjna', type: 'handrail' }
  }
  if (userData.isPlatform || objName.includes('platform')) {
    return { name: 'Podest', type: 'platform' }
  }
  if (userData.isLadderModule || objName.includes('ladder')) {
    return { name: 'Moduł drabiny', type: 'ladder_module' }
  }

  return { name: obj.name || 'Element', type: 'unknown' }
}

function clearDeleteHighlight() {
  if (deleteHighlightedObject) {
    // Restore original materials
    deleteHighlightedObject.traverse((child) => {
      if (child instanceof THREE.Mesh && originalMaterials.has(child)) {
        child.material = originalMaterials.get(child)!
      }
    })
    originalMaterials.clear()
    deleteHighlightedObject = null
  }
}

// ============================================
// HIDDEN ELEMENTS SYSTEM (seller mode delete)
// ============================================

// Nadaj unikalne elementId wszystkim elementom w scenie
// Wywoływane po renderowaniu, przed applyHiddenElements
function assignElementIds() {
  // Counters for generating unique IDs
  const counters: Record<string, number> = {}

  ladderContainer.traverse((child) => {
    // Skip if already has elementId
    if (child.userData.elementId) return

    const userData = child.userData
    let elementId: string | null = null

    // Cage hoops
    if (userData.isSafetyCage) {
      const key = `cage_hoop_${userData.ladderNum || 1}`
      counters[key] = (counters[key] || 0)
      elementId = `${key}_${counters[key]++}`
    }
    // Cage closing
    else if (userData.isCageClosing) {
      elementId = `cage_closing_${userData.ladderNum || 1}`
    }
    // Resting platform
    else if (userData.isRestingPlatform) {
      elementId = `resting_platform_${userData.ladderNum || 1}`
    }
    // Angle brackets
    else if (userData.isAngleBracket) {
      const key = `angle_bracket_${userData.ladderNum || 1}`
      counters[key] = (counters[key] || 0)
      elementId = `${key}_${counters[key]++}`
    }
    // Ladder modules
    else if (userData.isLadderModule) {
      const key = `ladder_module_${userData.ladderNum || 1}`
      counters[key] = (counters[key] || 0)
      elementId = `${key}_${counters[key]++}`
    }
    // Connectors
    else if (userData.isConnector) {
      const ladderNum = userData.ladderNum || 1
      const pairIndex = userData.pairIndex
      const side = userData.side || (child.position.x < 0 ? 'left' : 'right')
      if (pairIndex !== undefined) {
        elementId = `connector_${ladderNum}_${pairIndex}_${side}`
      } else {
        // Use counter for connectors without pairIndex (handrail connectors)
        const key = `connector_${ladderNum}_${side}`
        counters[key] = (counters[key] || 0)
        elementId = `${key}_${counters[key]++}`
      }
    }
    // Wsporniki
    else if (userData.isWspornik) {
      const ladderNum = userData.ladderNum || 1
      const pairIndex = userData.pairIndex
      const side = userData.side || (child.position.x < 0 ? 'left' : 'right')
      if (pairIndex !== undefined) {
        elementId = `wspornik_${ladderNum}_${pairIndex}_${side}`
      } else {
        // Use counter for wsporniki without pairIndex
        const key = `wspornik_${ladderNum}_${side}`
        counters[key] = (counters[key] || 0)
        elementId = `${key}_${counters[key]++}`
      }
    }
    // Sciskane handles
    else if (userData.isSciskaneHandle || userData.isSciskanePlaced) {
      const ladderNum = userData.ladderNum || 1
      const offset = userData.offsetFromBottom || 0
      const side = userData.side || (child.position.x < 0 ? 'left' : 'right')
      elementId = `sciskane_${ladderNum}_${offset}_${side}`
    }
    // Sciskane wsporniki
    else if (userData.isSciskaneWspornik) {
      const ladderNum = userData.ladderNum || 1
      const offset = userData.offsetFromBottom || 0
      const side = userData.side || (child.position.x < 0 ? 'left' : 'right')
      elementId = `sciskane_wsp_${ladderNum}_${offset}_${side}`
    }
    // Handrails
    else if (userData.isHandrail) {
      const side = userData.side || (child.position.x < 0 ? 'left' : 'right')
      elementId = `handrail_${userData.ladderNum || 1}_${side}`
    }
    // Platform
    else if (userData.isPlatform) {
      elementId = `platform_${userData.ladderNum || 1}`
    }
    // Descent ladder connectors
    else if (userData.isDescentConnector) {
      const key = `descent_connector`
      counters[key] = (counters[key] || 0)
      elementId = `${key}_${counters[key]++}`
    }
    // Descent ladder modules
    else if (userData.isDescentLadder) {
      const key = `descent_ladder`
      counters[key] = (counters[key] || 0)
      elementId = `${key}_${counters[key]++}`
    }

    if (elementId) {
      // Propagate elementId to this object AND all its descendants
      child.traverse((descendant) => {
        descendant.userData.elementId = elementId
      })
    }
  })
}

// Ukryj element po jego ID
function hideElement(elementId: string): boolean {
  console.log('[hideElement] Called with elementId:', elementId)
  if (!elementId) return false

  hiddenElements.add(elementId)

  // Znajdź obiekt w scenie i ukryj go
  let found = false
  ladderContainer.traverse((child) => {
    if (child.userData.elementId === elementId) {
      console.log('[hideElement] Found element, setting visible=false')
      child.visible = false
      found = true
    }
  })

  console.log('[hideElement] Element found:', found, 'calling emitUpdate')
  if (found) {
    emitUpdate() // Przelicz BOM (pominie ukryte elementy)
    requestRender()
  }

  return found
}

// Pokaż element po jego ID
function showElement(elementId: string): boolean {
  if (!elementId) return false

  hiddenElements.delete(elementId)

  // Znajdź obiekt w scenie i pokaż go
  let found = false
  ladderContainer.traverse((child) => {
    if (child.userData.elementId === elementId) {
      child.visible = true
      found = true
    }
  })

  if (found) {
    emitUpdate() // Przelicz BOM
    requestRender()
  }

  return found
}

// Wyczyść wszystkie ukryte elementy (przy zmianie konfiguracji)
function clearHiddenElements() {
  hiddenElements.clear()
}

// Pobierz listę ukrytych elementów (do zapisu)
function getHiddenElements(): string[] {
  return Array.from(hiddenElements)
}

// Ustaw listę ukrytych elementów (przy wczytywaniu)
function setHiddenElements(ids: string[]) {
  hiddenElements = new Set(ids)
  applyHiddenElements()
}

// Zastosuj ukrycie do wszystkich elementów w scenie
// Wywoływane po renderowaniu modelu
function applyHiddenElements() {
  if (hiddenElements.size === 0) return

  ladderContainer.traverse((child) => {
    if (child.userData.elementId && hiddenElements.has(child.userData.elementId)) {
      child.visible = false
    }
  })
}

// Stare funkcje dla kompatybilności (używane przez AdminLayout)
function performDelete(data: { object: THREE.Object3D }): string | null {
  const obj = data.object
  if (obj && obj.userData.elementId) {
    const elementId = obj.userData.elementId
    hideElement(elementId)
    return elementId
  }
  return null
}

function restoreDeleted(data: { elementId: string }): boolean {
  return showElement(data.elementId)
}

// ============================================
// TECHNICAL DRAWING MODE FUNCTIONS
// ============================================
function enterTechDrawingMode(view: 'front' | 'side' | 'back' | 'top' = 'front') {
  techDrawingView = view

  // Save state only on first entry
  if (!isTechDrawingMode) {
    savedCameraState = {
      rotation: { x: currentRotation.x, y: currentRotation.y },
      offset: { x: cameraOffset.x, y: cameraOffset.y, z: cameraOffset.z },
      ladderPos: { x: ladderContainer.position.x, y: ladderContainer.position.y, z: ladderContainer.position.z }
    }
    savedBackground = (scene.background as THREE.Color).clone()
  }

  isTechDrawingMode = true

  // White background
  scene.background = new THREE.Color(0xffffff)

  // Calculate scene height for camera fitting (use wall height if available, otherwise ladder height)
  const height1 = getTotalHeightForLadder(1)
  let totalHeight = height1
  let totalHeightWithHandrails = totalHeight

  if (handrailType === 'safety' || handrailType === 'platform') {
    totalHeightWithHandrails += DIMS.handrailVertical
  } else if (handrailType === 'attic') {
    totalHeightWithHandrails += DIMS.atticRailHeight
  }

  // Use wall height if wall is shown, otherwise use ladder height
  // This ensures we see the full wall including ground when ladder is suspended
  let sceneHeight = totalHeightWithHandrails
  if (showWall && wallHeightConfig > 0) {
    sceneHeight = Math.max(wallHeightConfig, totalHeightWithHandrails + suspendedHeight1)
  }

  // Ortho camera size with margin
  const modelHeight = sceneHeight * SCALE
  const margin = 1.3
  let orthoSize = Math.max(modelHeight * margin / 2, 5)

  const container = containerRef.value!
  const aspect = container.clientWidth / container.clientHeight
  orthoCamera.left = -orthoSize * aspect
  orthoCamera.right = orthoSize * aspect
  orthoCamera.top = orthoSize
  orthoCamera.bottom = -orthoSize
  orthoCamera.updateProjectionMatrix()

  // Reset rotation and position for technical view
  pivotGroup.rotation.x = 0
  pivotGroup.rotation.y = 0
  ladderContainer.position.set(0, 0, 0)

  // Calculate lookAtY based on actual ladder position in the scene
  // The ladder is built with its bottom at a certain Y, we need to find the center of the visible scene
  const ladderHeight = totalHeightWithHandrails * SCALE
  let lookAtY: number

  // Center camera on the ladder - use same logic for both wall and no-wall cases
  // Lower offsetY multiplier = model appears higher in view
  const extraOffset = (handrailType === 'none') ? 0.08 : 0.01
  const offsetY = ladderHeight * (0.42 + extraOffset)
  lookAtY = ladderHeight / 2 - offsetY

  // Set camera position and orientation for view
  // Reset up vector first (except for top view)
  if (view !== 'top') {
    orthoCamera.up.set(0, 1, 0)
  }

  if (view === 'front') {
    orthoCamera.position.set(0, lookAtY, 50)
    orthoCamera.lookAt(0, lookAtY, 0)
  } else if (view === 'side') {
    orthoCamera.position.set(50, lookAtY, 0)
    orthoCamera.lookAt(0, lookAtY, 0)
  } else if (view === 'back') {
    orthoCamera.position.set(0, lookAtY, -50)
    orthoCamera.lookAt(0, lookAtY, 0)
  } else if (view === 'top') {
    orthoCamera.up.set(0, 0, -1)
    orthoCamera.position.set(0, 50, 0)
    orthoCamera.lookAt(0, 0, 0)
  }

  orthoCamera.updateProjectionMatrix()

  // Switch to orthographic camera
  camera = orthoCamera

  // Emit event
  emit('techDrawingChange', {
    enabled: true,
    view,
    totalHeightMm: Math.round(totalHeightWithHandrails)
  })

  requestRender() // Render after view change
}

function exitTechDrawingMode() {
  if (!isTechDrawingMode) return
  isTechDrawingMode = false

  // Restore background
  if (savedBackground) {
    scene.background = savedBackground
  }

  // Restore camera state
  if (savedCameraState) {
    currentRotation.x = savedCameraState.rotation.x
    currentRotation.y = savedCameraState.rotation.y
    targetRotation.x = savedCameraState.rotation.x
    targetRotation.y = savedCameraState.rotation.y
    cameraOffset.x = savedCameraState.offset.x
    cameraOffset.y = savedCameraState.offset.y
    cameraOffset.z = savedCameraState.offset.z
    ladderContainer.position.set(
      savedCameraState.ladderPos.x,
      savedCameraState.ladderPos.y,
      savedCameraState.ladderPos.z
    )
  }

  // Restore all ladder visibility (except debug boxes)
  ladderContainer.traverse((child) => {
    // Debug elements should respect showDebugBboxes flag
    if (child.userData.isGreenCollisionBox ||
        child.userData.isCollisionZone ||
        child.userData.isAtticPassageObstacle ||
        child.userData.isEaveCollision) {
      child.visible = showDebugBboxes
    } else if (child instanceof THREE.LineSegments &&
               child.material instanceof THREE.LineBasicMaterial &&
               (child.material.color.getHex() === 0xef4444 ||
                child.material.color.getHex() === 0x00ff00 ||
                child.material.color.getHex() === 0x66ff66 ||
                child.material.color.getHex() === 0xa78bfa)) {
      // Debug wireframes (red, green, purple)
      child.visible = showDebugBboxes
    } else {
      child.visible = true
    }
  })

  // Switch back to perspective camera
  camera = perspectiveCamera

  emit('techDrawingChange', {
    enabled: false,
    view: techDrawingView,
    totalHeightMm: 0
  })

  requestRender() // Render after exiting tech drawing mode
}

function toggleTechDrawingView() {
  if (!isTechDrawingMode) return

  const views: Array<'front' | 'side' | 'back' | 'top'> = ['front', 'side', 'back', 'top']
  const currentIndex = views.indexOf(techDrawingView)
  const nextIndex = (currentIndex + 1) % views.length
  enterTechDrawingMode(views[nextIndex])
}

// ============================================
// DEBUG MODE FUNCTIONS
// ============================================
function clearDebugObjects() {
  debugObjects.forEach(obj => {
    ladderContainer.remove(obj)
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry.dispose()
    }
  })
  debugObjects = []
}

function createDebugBoxes() {
  clearDebugObjects()
  if (!debugMode) return

  // Create collision zone boxes for wsporniki
  const height1 = getTotalHeightForLadder(1)
  const ladderTop = height1 / 2
  const topOffset = (handrailType === 'platform') ? -211 : -161
  const groundLevel = ladderTop - wallHeightConfig + topOffset

  // Get ladder sections
  const sections = getLadderSectionsForLadder(1)

  // Create debug boxes at each connector position
  let currentY = groundLevel
  for (let i = 0; i < sections.length; i++) {
    const sectionRungs = sections[i].rungs || 7
    const sectionHeight = sectionRungs * 275

    // Green box at connector position
    if (i < sections.length - 1 || handrailType === 'safety' || handrailType === 'platform') {
      const boxGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5)
      const boxMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5
      })
      const box = new THREE.Mesh(boxGeometry, boxMaterial)
      box.position.set(0, (currentY + sectionHeight) * SCALE, 0)
      ladderContainer.add(box)
      debugObjects.push(box)
    }

    currentY += sectionHeight
  }
}

function setDebugMode(enabled: boolean) {
  debugMode = enabled
  editMode = enabled  // Enable edit mode when debug mode is on
  showDebugBboxes = enabled

  if (enabled) {
    createDebugBoxes()
  } else {
    clearDebugObjects()
  }

  // Aktualizuj widoczność boxów mierzenia
  updateMeasurementBoxesVisibility()

  // Rebuild ladder to show/hide collision boxes
  createLadder()

  // Force immediate render update
  scheduleFrame()
}

// Kontrola widoczności boxów mierzenia (niezależna od debug mode)
function setShowMeasurementBoxes(enabled: boolean) {
  showMeasurementBoxes = enabled
  updateMeasurementBoxesVisibility()
  scheduleFrame()
}

function getShowMeasurementBoxes(): boolean {
  return showMeasurementBoxes
}

// Kontrola widoczności wymiarów (linia, label, dyski) - niezależna od debug mode
function setShowDimensions(enabled: boolean) {
  showDimensions = enabled
  updateMeasurementBoxesVisibility()
  scheduleFrame()
}

function getShowDimensions(): boolean {
  return showDimensions
}

function emitDebugInfo() {
  const height1 = getTotalHeightForLadder(1)
  const sections = getLadderSectionsForLadder(1)

  emit('debugInfo', {
    cameraRotation: { x: currentRotation.x, y: currentRotation.y },
    cameraOffset: { x: cameraOffset.x, y: cameraOffset.y, z: cameraOffset.z },
    cameraZ: perspectiveCamera?.position.z || 50,
    totalHeight1: height1,
    numModules: sections.length,
    connectorCount: connectorObjects.length / 2, // Left + right pairs
    wspornikCount: wspornikObjects.length / 2  // Left + right pairs
  })
}

// ============================================
// GLOBAL SETTINGS (wall, wspornik distance)
// ============================================

// Determine wspornik type based on distance
function getWspornikTypeForDistance(distanceMm: number): string {
  if (distanceMm <= 260) return 'krotki'
  if (distanceMm <= 360) return 'sredni'
  return 'dlugi'
}

function setGlobalWspornikDistance(distanceMm: number, ladderNum: number = 1) {
  // Jak wyzej - typ C zostaje typem C, zmienia sie tylko wariant rozmiarowy.
  const biezacyTyp = (ladderNum === 1) ? defaultWspornik1 : defaultWspornik2
  const newType = isTypC(biezacyTyp)
    ? typCDlaOdleglosci(distanceMm)
    : getWspornikTypeForDistance(distanceMm)

  if (ladderNum === 1) {
    globalWspornikDistance1 = distanceMm
    defaultWspornik1 = newType

    // Update all sciskane handles
    for (const handle of sciskaneHandles1) {
      handle.wspornikDistance = distanceMm
      handle.wspornikType = newType
    }

    // Update mid-rung bracket
    midRungBracketDistance1 = distanceMm
    midRungBracketWspornikType1 = newType

    // Update wspornik distances array
    for (let i = 0; i < wspornikDistances1.length; i++) {
      wspornikDistances1[i] = distanceMm
    }
    // Update wspornik types array
    for (let i = 0; i < wspornikTypes1.length; i++) {
      wspornikTypes1[i] = newType
    }
  } else {
    globalWspornikDistance2 = distanceMm
    defaultWspornik2 = newType

    // Update all sciskane handles
    for (const handle of sciskaneHandles2) {
      handle.wspornikDistance = distanceMm
      handle.wspornikType = newType
    }

    // Update mid-rung bracket
    midRungBracketDistance2 = distanceMm
    midRungBracketWspornikType2 = newType

    // Update wspornik distances array
    for (let i = 0; i < wspornikDistances2.length; i++) {
      wspornikDistances2[i] = distanceMm
    }
    // Update wspornik types array
    for (let i = 0; i < wspornikTypes2.length; i++) {
      wspornikTypes2[i] = newType
    }
  }

  // Rebuild ladder to apply new distance
  createLadder()
}

function getGlobalWspornikDistance(ladderNum: number = 1): number {
  return ladderNum === 1 ? globalWspornikDistance1 : globalWspornikDistance2
}

function setWallWidth(widthMm: number) {
  wallWidthConfig = widthMm
  // Rebuild scene to update wall and ground
  createLadder()
}

function getWallWidth(): number {
  return wallWidthConfig
}

// ============================================
// SCISKANE MODE (edit handles)
// ============================================
function toggleSciskaneMode() {
  sciskaneMode = !sciskaneMode
  if (sciskaneMode) {
    createSciskanePreview()
  } else {
    clearSciskanePreview()
  }
  // Force immediate render update
  scheduleFrame()
}

function createSciskanePreview() {
  clearSciskanePreview()

  // Use sciskany model, fallback to uchwyt
  const sourceModel = loadedModels.sciskany || loadedModels.uchwyt
  if (!sourceModel) return

  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)

  // Preview material - green transparent
  const previewMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    metalness: 0.5,
    roughness: 0.5,
    transparent: true,
    opacity: 0.4
  })

  const railOffset = 265

  // Helper function to create previews for a ladder
  const createPreviewsForLadder = (ladderNum: number) => {
    const sections = getLadderSectionsForLadder(ladderNum)
    if (sections.length === 0) return

    const geoConfig = ladderGeometryConfig[ladderNum]
    let currentOffset = 0

    for (let s = 0; s < sections.length; s++) {
      const section = sections[s]
      const sectionHeight = getLadderHeight(section.rungs)

      // Create preview for each space between rungs
      for (let i = 0; i < section.rungs - 1; i++) {
        const yPos = (maxHeight / 2) - currentOffset - DIMS.firstRungFromTop - (i * DIMS.rungSpacing) - DIMS.rungSpacing / 2

        // Check if position is valid (not too close to existing connectors)
        if (!isPositionValidForSciskane(yPos, ladderNum)) continue

        // Left preview
        const leftPreview = sourceModel.clone(true)
        leftPreview.scale.set(SCALE, SCALE, SCALE)
        const leftRot = geoConfig.sciskane.left
        leftPreview.rotation.set(leftRot.x, leftRot.y, leftRot.z)
        leftPreview.position.x = -railOffset * SCALE
        leftPreview.position.y = yPos * SCALE
        leftPreview.position.z = (geoConfig.sciskane.leftZOffset + geoConfig.zOffset) * SCALE
        leftPreview.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = previewMaterial.clone()
          }
        })
        leftPreview.userData.isSciskanePreview = true
        leftPreview.userData.previewY = yPos
        leftPreview.userData.ladderNum = ladderNum
        ladderContainer.add(leftPreview)
        sciskanePreviewObjects.push(leftPreview)

        // Right preview
        const rightPreview = sourceModel.clone(true)
        rightPreview.scale.set(SCALE, SCALE, SCALE)
        const rightRot = geoConfig.sciskane.right
        rightPreview.rotation.set(rightRot.x, rightRot.y, rightRot.z)
        rightPreview.position.x = railOffset * SCALE
        rightPreview.position.y = yPos * SCALE
        rightPreview.position.z = (geoConfig.sciskane.rightZOffset + geoConfig.zOffset) * SCALE
        rightPreview.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = previewMaterial.clone()
          }
        })
        rightPreview.userData.isSciskanePreview = true
        rightPreview.userData.previewY = yPos
        rightPreview.userData.ladderNum = ladderNum
        ladderContainer.add(rightPreview)
        sciskanePreviewObjects.push(rightPreview)
      }

      currentOffset += sectionHeight
      if (s < sections.length - 1) {
        currentOffset += 3 // 3mm gap between sections
      }
    }
  }

  // Create previews for ladder 1 (entry side)
  createPreviewsForLadder(1)

  // Create previews for ladder 2 (descent side) - only when in attic mode or brackets mode
  const isAtticMode = handrailType === 'attic'
  const isBracketsMode = props.descentMountType === 'brackets'
  if ((isAtticMode || isBracketsMode) && props.descentLadder && height2 > 0) {
    createPreviewsForLadder(2)
  }
}

function isPositionValidForSciskane(yPos: number, ladderNum: number = 1): boolean {
  const ladderTotalHeight = getTotalHeightForLadder(ladderNum)
  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)
  const minDistance = 150 // 15cm minimum distance from connectors

  // Check distance from ladder 1 connectors
  const connectorPositions = getConnectorPositions()
  for (const connY of connectorPositions) {
    if (Math.abs(yPos - connY) < minDistance) {
      return false
    }
  }

  // Check distance from descent ladder (ladder 2) connectors in brackets mode
  if (ladderNum === 2 && props.descentMountType === 'brackets' && props.descentLadder) {
    const descentConnectorPositions = getDescentConnectorPositions()
    for (const connY of descentConnectorPositions) {
      if (Math.abs(yPos - connY) < minDistance) {
        return false
      }
    }
  }

  // Check distance from midRungBracket
  const midRungBracketEnabled = (ladderNum === 1) ? midRungBracket1 : midRungBracket2
  if (midRungBracketEnabled && handrailType !== 'attic') {
    const midRungY = (maxHeight / 2) - 548.5
    if (Math.abs(yPos - midRungY) < minDistance) {
      return false
    }
  }

  // Check distance from existing sciskane handles
  const currentHandles = (ladderNum === 1) ? sciskaneHandles1 : sciskaneHandles2
  for (const handle of currentHandles) {
    const handleY = (maxHeight / 2) - ladderTotalHeight + handle.offsetFromBottom
    if (Math.abs(yPos - handleY) < minDistance) {
      return false
    }
  }

  return true
}

/**
 * Get connector positions for descent ladder (ladder 2) in brackets mode
 */
function getDescentConnectorPositions(): number[] {
  const positions: number[] = []

  if (!props.descentLadder) return positions

  const { repeatLadder7, endLadderRungs } = props.descentLadder
  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)

  const X7_HEIGHT = 1925
  const SECTION_GAP = 3

  // Top of main rails (góra drabiny zejścia)
  const topOfMainRails = maxHeight / 2
  const ladderStartY = topOfMainRails - 91

  // Top connector position
  const topY = ladderStartY + (DIMS.connectorHeight / 2) + 50
  const topConnectorYOffset = 100 - 113  // Korekta -113mm
  positions.push(topY + topConnectorYOffset)

  // Connectors between sections
  let currentOffset = 0

  for (let i = 0; i < repeatLadder7; i++) {
    currentOffset += X7_HEIGHT

    const isLastX7 = (i === repeatLadder7 - 1)
    const hasMoreSections = !isLastX7 || endLadderRungs > 0

    if (hasMoreSections) {
      const gapCenterOffset = SECTION_GAP / 2
      const connectionY = ladderStartY - currentOffset - gapCenterOffset + (DIMS.connectorHeight / 2) - 50 + 91
      positions.push(connectionY)
      currentOffset += SECTION_GAP
    }
  }

  return positions
}

function addSciskaneHandle(yPos: number, ladderNum: number = 1) {
  const height = getTotalHeightForLadder(ladderNum)
  const maxHeight = Math.max(getTotalHeightForLadder(1), getTotalHeightForLadder(2))

  // Calculate offset from bottom
  const offsetFromBottom = yPos - (maxHeight / 2 - height)

  const handles = ladderNum === 1 ? sciskaneHandles1 : sciskaneHandles2

  // Check if already exists
  for (const handle of handles) {
    if (Math.abs(handle.offsetFromBottom - offsetFromBottom) < 50) {
      return // Already exists
    }
  }

  // Get global wspornik settings for this ladder (same as auto-added handles)
  const globalDistance = (ladderNum === 1) ? globalWspornikDistance1 : globalWspornikDistance2
  const globalType = getWspornikTypeFromDistance(globalDistance)
  const isDisabled = (ladderNum === 1) ? wspornikDisabled1 : wspornikDisabled2

  // Add new handle with current global settings
  handles.push({
    offsetFromBottom,
    connType: 'sciskany',
    wspornikType: isDisabled ? 'none' : globalType,
    wspornikDistance: globalDistance,
    autoAdded: false
  })

  // Rebuild ladder to show new handle
  createLadder()

  // Re-create preview (to remove used position)
  if (sciskaneMode) {
    createSciskanePreview()
  }
}

function updateSciskaneHandle(offsetFromBottom: number, ladderNum: number, updates: {
  connType?: string
  wspornikType?: string
  wspornikDistance?: number
}) {
  const handles = ladderNum === 1 ? sciskaneHandles1 : sciskaneHandles2
  const handle = handles.find(h => h.offsetFromBottom === offsetFromBottom)

  if (handle) {
    if (updates.connType !== undefined) handle.connType = updates.connType
    if (updates.wspornikType !== undefined) {
      handle.wspornikType = updates.wspornikType
      // Wybor z okna "Edytuj uchwyty" jest decyzja czlowieka i ma sie utrzymac.
      // Bez tego znacznika typWspornikaUchwytu() sprowadzalaby uchwyt z powrotem
      // do rodziny drabiny - czyli krotki/sredni/dlugi zamienialyby sie
      // z powrotem na typ C zaraz po kliknieciu.
      handle.wspornikTypeManual = true
    }
    if (updates.wspornikDistance !== undefined) handle.wspornikDistance = updates.wspornikDistance

    createLadder()
    if (sciskaneMode) {
      createSciskanePreview()
    }
  }
}

function removeSciskaneHandle(offsetFromBottom: number, ladderNum: number) {
  const handles = ladderNum === 1 ? sciskaneHandles1 : sciskaneHandles2
  const index = handles.findIndex(h => h.offsetFromBottom === offsetFromBottom)

  if (index !== -1) {
    handles.splice(index, 1)
    createLadder()
    if (sciskaneMode) {
      createSciskanePreview()
    }
  }
}

function updateJointConnector(pairIndex: number, ladderNum: number, updates: {
  connType?: string
  wspornikType?: string
  wspornikDistance?: number
}) {
  const connTypes = ladderNum === 1 ? connectorTypes1 : connectorTypes2
  const wspTypes = ladderNum === 1 ? wspornikTypes1 : wspornikTypes2
  const wspDistances = ladderNum === 1 ? wspornikDistances1 : wspornikDistances2

  if (pairIndex !== undefined && pairIndex < connTypes.length) {
    if (updates.connType !== undefined) {
      connTypes[pairIndex] = updates.connType
      // If changing to lacznik, remove from autoChangedToLacznik if present (user manually set it)
      if (updates.connType === 'lacznik') {
        const autoIdx = autoChangedToLacznik.indexOf(pairIndex)
        if (autoIdx !== -1) {
          autoChangedToLacznik.splice(autoIdx, 1)
        }
      }
    }
    if (updates.wspornikType !== undefined) {
      wspTypes[pairIndex] = updates.wspornikType
    }
    if (updates.wspornikDistance !== undefined) {
      wspDistances[pairIndex] = updates.wspornikDistance
    }

    createLadder()
    if (sciskaneMode) {
      createSciskanePreview()
    }
  }
}

// ============================================
// MID-RUNG BRACKET FUNCTIONS
// ============================================
function updateMidRungBracket(ladderNum: number, updates: {
  connType?: string
  wspornikType?: string
  wspornikDistance?: number
}) {
  if (ladderNum === 1) {
    if (updates.connType !== undefined) midRungBracketConnType1 = updates.connType
    if (updates.wspornikType !== undefined) midRungBracketWspornikType1 = updates.wspornikType
    if (updates.wspornikDistance !== undefined) midRungBracketDistance1 = updates.wspornikDistance
  } else {
    if (updates.connType !== undefined) midRungBracketConnType2 = updates.connType
    if (updates.wspornikType !== undefined) midRungBracketWspornikType2 = updates.wspornikType
    if (updates.wspornikDistance !== undefined) midRungBracketDistance2 = updates.wspornikDistance
  }

  createLadder()
  if (sciskaneMode) {
    createSciskanePreview()
  }
}

function removeMidRungBracket(ladderNum: number) {
  if (ladderNum === 1) {
    midRungBracket1 = false
  } else {
    midRungBracket2 = false
  }

  createLadder()
  if (sciskaneMode) {
    createSciskanePreview()
  }
}

function getMidRungBracketState(ladderNum: number) {
  if (ladderNum === 1) {
    return {
      enabled: midRungBracket1,
      connType: midRungBracketConnType1,
      wspornikType: midRungBracketWspornikType1,
      wspornikDistance: midRungBracketDistance1
    }
  } else {
    return {
      enabled: midRungBracket2,
      connType: midRungBracketConnType2,
      wspornikType: midRungBracketWspornikType2,
      wspornikDistance: midRungBracketDistance2
    }
  }
}

function clearSciskanePreview() {
  for (const obj of sciskanePreviewObjects) {
    if (obj.parent === ladderContainer) {
      ladderContainer.remove(obj)
    }
  }
  sciskanePreviewObjects = []
}

// ============================================
// DEBUG EDITOR FUNCTIONS
// ============================================

function getAvailableModels(): string[] {
  const models: string[] = []
  if (loadedModels.powielana) models.push('powielana')
  if (loadedModels.attyka) models.push('attyka')
  if (loadedModels.krataWema) models.push('krataWema')
  if (loadedModels.uchwyt) models.push('uchwyt')
  if (loadedModels.lacznik) models.push('lacznik')
  if (loadedModels.porecz) models.push('porecz')
  if (loadedModels.uchwytPoreczy) models.push('uchwytPoreczy')
  if (loadedModels.sciskany) models.push('sciskany')
  if (loadedModels.obrecz) models.push('obrecz')
  if (loadedModels.zamykanie) models.push('zamykanie')
  if (loadedModels.katownikX2) models.push('katownikX2')
  if (loadedModels.katownikX3) models.push('katownikX3')
  if (loadedModels.katownikX4) models.push('katownikX4')
  if (loadedModels.wspornikKrotki) models.push('wspornikKrotki')
  if (loadedModels.wspornikSredniLewy) models.push('wspornikSredniLewy')
  if (loadedModels.wspornikSredniPrawy) models.push('wspornikSredniPrawy')
  if (loadedModels.wspornikDlugiLewy) models.push('wspornikDlugiLewy')
  if (loadedModels.wspornikDlugiPrawy) models.push('wspornikDlugiPrawy')
  if (loadedModels.bigfoot) models.push('bigfoot')
  if (loadedModels.prowadnicaBigfoot) models.push('prowadnicaBigfoot')
  if (loadedModels.podestSpoczynkowy) models.push('podestSpoczynkowy')
  if (loadedModels.podestKrotki) models.push('podestKrotki')
  for (let i = 1; i <= 7; i++) {
    if (loadedModels.koncowa[i]) models.push(`koncowa-x${i}`)
  }
  return models
}

function addDebugModel(modelName: string): DebugObject | null {
  if (!ladderContainer) return null

  let sourceModel: THREE.Group | null = null

  // Find the model
  if (modelName.startsWith('koncowa-x')) {
    const rungs = parseInt(modelName.replace('koncowa-x', ''))
    sourceModel = loadedModels.koncowa[rungs] || null
  } else {
    // Type-safe lookup
    const modelMap: Record<string, THREE.Group | null> = {
      powielana: loadedModels.powielana,
      attyka: loadedModels.attyka,
      krataWema: loadedModels.krataWema,
      uchwyt: loadedModels.uchwyt,
      lacznik: loadedModels.lacznik,
      porecz: loadedModels.porecz,
      uchwytPoreczy: loadedModels.uchwytPoreczy,
      sciskany: loadedModels.sciskany,
      obrecz: loadedModels.obrecz,
      zamykanie: loadedModels.zamykanie,
      katownikX2: loadedModels.katownikX2,
      katownikX3: loadedModels.katownikX3,
      katownikX4: loadedModels.katownikX4,
      wspornikKrotki: loadedModels.wspornikKrotki,
      wspornikSredniLewy: loadedModels.wspornikSredniLewy,
      wspornikSredniPrawy: loadedModels.wspornikSredniPrawy,
      wspornikDlugiLewy: loadedModels.wspornikDlugiLewy,
      wspornikDlugiPrawy: loadedModels.wspornikDlugiPrawy,
      bigfoot: loadedModels.bigfoot,
      prowadnicaBigfoot: loadedModels.prowadnicaBigfoot,
      podestSpoczynkowy: loadedModels.podestSpoczynkowy,
      podestKrotki: loadedModels.podestKrotki
    }
    sourceModel = modelMap[modelName] || null
  }

  if (!sourceModel) return null

  const model = sourceModel.clone(true)
  model.scale.set(SCALE, SCALE, SCALE)
  model.position.set(0, 0, 0)

  const debugObj: DebugObject = {
    id: `debug_${++debugObjectIdCounter}`,
    name: modelName,
    type: 'model',
    object: model,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  }

  model.userData.debugObjectId = debugObj.id
  addOutlineToModel(model)
  ladderContainer.add(model)
  debugEditorObjects.push(debugObj)

  return debugObj
}

function addDebugBox(width: number, height: number, depth: number, color: string): DebugObject | null {
  if (!ladderContainer) return null

  const geometry = new THREE.BoxGeometry(width * SCALE, height * SCALE, depth * SCALE)
  const material = new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.3,
    roughness: 0.7
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(0, 0, 0)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const debugObj: DebugObject = {
    id: `debug_${++debugObjectIdCounter}`,
    name: `Box ${width}x${height}x${depth}`,
    type: 'box',
    object: mesh,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: color,
    dimensions: { width, height, depth }
  }

  mesh.userData.debugObjectId = debugObj.id
  ladderContainer.add(mesh)
  debugEditorObjects.push(debugObj)

  return debugObj
}

function updateDebugObject(id: string, updates: {
  position?: { x: number; y: number; z: number }
  rotation?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
}): void {
  const debugObj = debugEditorObjects.find(o => o.id === id)
  if (!debugObj) return

  if (updates.position) {
    debugObj.position = { ...updates.position }
    debugObj.object.position.set(
      updates.position.x * SCALE,
      updates.position.y * SCALE,
      updates.position.z * SCALE
    )
  }

  if (updates.rotation) {
    debugObj.rotation = { ...updates.rotation }
    debugObj.object.rotation.set(
      updates.rotation.x * Math.PI / 180,
      updates.rotation.y * Math.PI / 180,
      updates.rotation.z * Math.PI / 180
    )
  }

  if (updates.scale) {
    debugObj.scale = { ...updates.scale }
    debugObj.object.scale.set(
      updates.scale.x * SCALE,
      updates.scale.y * SCALE,
      updates.scale.z * SCALE
    )
  }
}

function removeDebugObject(id: string): void {
  const index = debugEditorObjects.findIndex(o => o.id === id)
  if (index === -1) return

  const debugObj = debugEditorObjects[index]
  if (debugObj.object.parent === ladderContainer) {
    ladderContainer.remove(debugObj.object)
  }

  debugEditorObjects.splice(index, 1)

  if (selectedDebugObject?.id === id) {
    selectedDebugObject = null
  }
}

function getDebugObjects(): DebugObject[] {
  return debugEditorObjects.map(obj => ({
    ...obj,
    object: obj.object // Include reference but shouldn't be serialized
  }))
}

function selectDebugObject(id: string | null): void {
  selectedDebugObject = id ? debugEditorObjects.find(o => o.id === id) || null : null

  // Attach/detach transform controls
  if (transformControls) {
    const helper = transformControls.getHelper()
    if (selectedDebugObject) {
      transformControls.attach(selectedDebugObject.object)
      helper.visible = true
      transformControls.enabled = true
    } else {
      transformControls.detach()
      helper.visible = false
      transformControls.enabled = false
    }
  }
}

function setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
  transformMode = mode
  if (transformControls) {
    transformControls.setMode(mode)
  }
}

function getTransformMode(): string {
  return transformMode
}

function getSelectedDebugObject(): DebugObject | null {
  return selectedDebugObject
}

function clearAllDebugObjects(): void {
  for (const obj of debugEditorObjects) {
    if (obj.object.parent === ladderContainer) {
      ladderContainer.remove(obj.object)
    }
  }
  debugEditorObjects = []
  selectedDebugObject = null
}

function duplicateDebugObject(id: string): DebugObject | null {
  const original = debugEditorObjects.find(o => o.id === id)
  if (!original) return null

  let newObj: DebugObject | null = null

  if (original.type === 'model') {
    newObj = addDebugModel(original.name)
  } else if (original.type === 'box' && original.dimensions) {
    newObj = addDebugBox(
      original.dimensions.width,
      original.dimensions.height,
      original.dimensions.depth,
      original.color || '#888888'
    )
  }

  if (newObj) {
    // Offset position slightly
    updateDebugObject(newObj.id, {
      position: {
        x: original.position.x + 100,
        y: original.position.y,
        z: original.position.z
      },
      rotation: { ...original.rotation },
      scale: { ...original.scale }
    })
  }

  return newObj
}

// ============================================
// BOM (BILL OF MATERIALS) GENERATION
// ============================================

export interface BOMItem {
  id: string
  name: string
  namePL: string
  quantity: number
  unit: string
  category: string
  details?: string
  image?: string
}

export interface BOMData {
  ladder1: {
    items: BOMItem[]
    config: {
      wallHeight: number
      scheme: string
      cage: string
      insulationThickness: number
      wspornikType: string
      wspornikDistance: number
      lastRungToGround?: number
      lastCageToGround?: number
    }
  }
  ladder2?: {
    items: BOMItem[]
    config: {
      wallHeight: number
      mountType: string
      insulationThickness: number
      wspornikType: string
      wspornikDistance: number
      minDistance: number
      lastRungToGround?: number
      lastCageToGround?: number
    }
  }
  generatedAt: Date
}

/**
 * Generate Bill of Materials from the current 3D scene
 * Counts all models and categorizes them
 */
function generateBOM(): BOMData {
  console.log('generateBOM called, ladderContainer:', !!ladderContainer)
  if (!ladderContainer) {
    console.log('No ladderContainer, returning empty BOM')
    return {
      ladder1: { items: [], config: { wallHeight: 0, scheme: '', cage: '', insulationThickness: 0, wspornikType: '', wspornikDistance: 0 } },
      generatedAt: new Date()
    }
  }

  // Counters for ladder 1 (entry)
  const counts1: Record<string, { count: number; details?: string }> = {}
  // Counters for ladder 2 (descent)
  const counts2: Record<string, { count: number; details?: string }> = {}

  // Traverse all children
  ladderContainer.traverse((child) => {
    if (child === ladderContainer) return
    // Skip hidden elements (deleted by seller)
    if (!child.visible) return
    // Skip helper/debug objects
    if (child.userData.isOutline) return
    if (child.userData.isMeasureObject) return
    if (child.userData.isGreenCollisionBox) return
    if (child.userData.isCollisionZone) return
    if (child.userData.isMidRungBox) return
    if (child.userData.isSciskaneBox) return
    if (child.userData.isSciskanePreview) return
    if (child.type === 'Line' || child.type === 'LineSegments') return

    // Skip non-top-level (already counted with parent)
    if (child.parent !== ladderContainer) return

    // Skip generic shapes (walls, ground, insulation - boxes without specific userData)
    if (child.userData.isWall) return
    if (child.userData.isGround) return
    if (child.userData.isInsulation) return
    if (child.userData.isObstacle) return

    // Determine ladder number
    const ladderNum = child.userData.ladderNum || 1
    const counts = ladderNum === 1 ? counts1 : counts2

    // Categorize object
    let itemKey = ''
    let details = ''

    if (child.userData.isLadderModule) {
      const rungs = child.userData.rungs || 7
      const moduleType = child.userData.moduleType || 'standard'

      if (rungs === 7) {
        // Rozróżnij powielaną od końcowej 7-szczeblowej
        if (moduleType === 'final' || moduleType === 'alt') {
          itemKey = 'ladder_final_x7'  // Drabina końcowa 7-szczeblowa
        } else {
          itemKey = 'ladder_x7'  // Drabina powielana 7-szczeblowa
        }
      } else if (rungs === 8) {
        itemKey = 'ladder_x8'
      } else {
        // Końcowe x1-x6
        itemKey = `ladder_x${rungs}`
      }
    } else if (child.userData.isConnector) {
      const connType = child.userData.connectorType || 'uchwyt'
      if (connType === 'sciskany') {
        itemKey = 'connector_sciskany'
      } else if (connType === 'lacznik') {
        itemKey = 'element_laczacy'
      } else if (connType === 'uchwytPoreczy') {
        itemKey = 'handrail_connector'
      } else {
        itemKey = 'connector_uchwyt'
      }
      if (child.userData.isMidRungBracket) {
        details = 'środkowy'
      }
    } else if (child.userData.isWspornik) {
      const wspType = child.userData.wspornikType || 'krotki'
      if (wspType === 'krotki' || wspType === 'short') {
        itemKey = 'wspornik_krotki'
      } else if (wspType === 'sredni' || wspType === 'medium') {
        itemKey = 'wspornik_sredni'
      } else if (wspType === 'dlugi' || wspType === 'long') {
        itemKey = 'wspornik_dlugi'
      } else if (wspType === 'none') {
        return // Skip 'none' wsporniki
      } else {
        itemKey = 'wspornik_' + wspType
      }
    } else if (child.userData.isSafetyCage || child.userData.isCageHoop) {
      itemKey = 'cage_hoop'
    } else if (child.userData.isCageClosing) {
      itemKey = 'cage_closing'
    } else if (child.userData.isRestingPlatform) {
      itemKey = 'resting_platform'
    } else if (child.userData.isHandrail) {
      itemKey = 'handrail'
    } else if (child.userData.isHandrailConnector) {
      itemKey = 'handrail_connector'
    } else if (child.userData.isPlatform) {
      itemKey = 'katownik_podestu'
    } else if (child.userData.isAtticPassage) {
      itemKey = 'attic_passage'
    } else if (child.userData.isKrataWema) {
      const size = child.userData.krataSize || '100x50'
      itemKey = `krata_wema_${size}`
    } else if (child.userData.isAngleBracket) {
      const segments = child.userData.segments || 2
      console.log('AngleBracket found, segments:', segments, 'elementId:', child.userData.elementId, 'visible:', child.visible, 'name:', child.name)
      itemKey = `angle_bracket_x${segments}`
    } else if (child.userData.isBigfoot) {
      itemKey = 'bigfoot'
    } else if (child.userData.isBigfootGuide) {
      // Skip - part of bigfoot assembly, not counted separately
      return
    } else if (child.userData.isModuleLacznik) {
      itemKey = 'module_connector'
    } else if (child.userData.isSciskanePlaced) {
      // Skip - already counted as connector
      return
    } else {
      // Unknown object - skip or log
      return
    }

    if (itemKey) {
      if (!counts[itemKey]) {
        counts[itemKey] = { count: 0, details }
      }
      counts[itemKey].count++
      if (details && !counts[itemKey].details) {
        counts[itemKey].details = details
      }
    }
  })

  console.log('counts1:', counts1)
  console.log('counts2:', counts2)

  // Łącznik drabiny zejścia.
  //
  // renderDescentLadderConnectors() uruchamia się TYLKO dla descentMountType
  // === 'brackets'. Przy bigfoocie i przy braku mocowania drabina zejścia
  // nadal wisi pod przełazem na łączniku - widać go na modelu, bo jest częścią
  // modelu przełazu, a nie osobnym obiektem sceny. Przejście po scenie liczy
  // obiekty, więc takiego łącznika nie widziało i nie trafiał on ani na listę
  // elementów, ani do wyceny.
  //
  // Kalkulator serwerowy liczy go zawsze, gdy istnieje drabina zejścia
  // (LadderCalculator.php: 'Uchwyt laczacy - zejscie'), więc obie ścieżki
  // się rozjeżdżały. Dokładamy go do licznika, a NIE do sceny - dorysowanie
  // drugiego obiektu zdublowałoby to, co model już pokazuje.
  //
  // Liczba 2 to jedna para (lewy + prawy) - tak samo jak liczone są łączniki
  // strony wejścia (jeden punkt 'lacznik' daje element_laczacy x2).
  const maDrabineZejscia = Object.keys(counts2).some((k) => k.startsWith('ladder_'))
  if (maDrabineZejscia && props.descentMountType !== 'brackets') {
    counts2['element_laczacy'] = {
      count: (counts2['element_laczacy']?.count || 0) + 2,
      details: 'zejście'
    }
  }

  // For safety/platform handrails: convert first X7 to "Początkowy moduł drabiny"
  if (handrailType === 'safety' || handrailType === 'platform') {
    if (counts1['ladder_x7'] && counts1['ladder_x7'].count > 0) {
      counts1['ladder_x7'].count--
      if (counts1['ladder_x7'].count === 0) {
        delete counts1['ladder_x7']
      }
      counts1['drabina_poczatkowa_7'] = { count: 1, details: undefined }
    }
  }

  // Convert counts to BOM items
  const itemDefinitions: Record<string, { namePL: string; unit: string; category: string; image?: string }> = {
    'drabina_poczatkowa_7': { namePL: 'Początkowy moduł drabiny (7 szczebli)', unit: 'szt.', category: 'drabina', image: 'drabina-x7' },
    'ladder_x7': { namePL: 'Drabina powielana X7 (7 szczebli)', unit: 'szt.', category: 'drabina', image: 'drabina-x7' },
    'ladder_final_x7': { namePL: 'Drabina końcowa X7 (7 szczebli)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x7' },
    'ladder_x8': { namePL: 'Moduł drabiny X8 (8 szczebli)', unit: 'szt.', category: 'drabina', image: 'drabina-x8' },
    'ladder_x1': { namePL: 'Drabina końcowa X1 (1 szczebel)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x1' },
    'ladder_x2': { namePL: 'Moduł końcowy X2 (2 szczeble)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x2' },
    'ladder_x3': { namePL: 'Moduł końcowy X3 (3 szczeble)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x3' },
    'ladder_x4': { namePL: 'Moduł końcowy X4 (4 szczeble)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x4' },
    'ladder_x5': { namePL: 'Moduł końcowy X5 (5 szczebli)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x5' },
    'ladder_x6': { namePL: 'Moduł końcowy X6 (6 szczebli)', unit: 'szt.', category: 'drabina', image: 'drabina-koncowa-x6' },
    'connector_uchwyt': { namePL: 'Uchwyt montażowy (para)', unit: 'szt.', category: 'łącznik', image: 'lacznik-drabin' },
    'connector_sciskany': { namePL: 'Uchwyt ściskany (para)', unit: 'szt.', category: 'łącznik', image: 'wspornik-sciskany' },
    'element_laczacy': { namePL: 'Element łączący', unit: 'szt.', category: 'łącznik', image: 'lacznik-drabin' },
    'wspornik_krotki': { namePL: 'Wspornik krótki (para)', unit: 'szt.', category: 'wspornik', image: 'wspornik-krotki' },
    'wspornik_sredni': { namePL: 'Wspornik średni (para)', unit: 'szt.', category: 'wspornik', image: 'wspornik-sredni' },
    'wspornik_dlugi': { namePL: 'Wspornik długi (para)', unit: 'szt.', category: 'wspornik', image: 'wspornik-dlugi' },
    'cage_hoop': { namePL: 'Obręcz kosza bezpieczeństwa', unit: 'szt.', category: 'kosz', image: 'obrecz' },
    'cage_closing': { namePL: 'Zamknięcie kosza', unit: 'szt.', category: 'kosz' },
    'resting_platform': { namePL: 'Podest spoczynkowy', unit: 'szt.', category: 'podest' },
    'handrail': { namePL: 'Poręcze asekuracyjne (L-ki)', unit: 'szt.', category: 'poręcz', image: 'l-ki' },
    'handrail_connector': { namePL: 'Łącznik poręczy asekuracyjnych', unit: 'para', category: 'poręcz', image: 'lacznik-poreczy' },
    'katownik_podestu': { namePL: 'Łączniki poręczy z podestem', unit: 'kpl.', category: 'podest' },
    'attic_passage': { namePL: 'Przejście przez attykę', unit: 'kpl.', category: 'attyka' },
    'krata_wema_100x50': { namePL: 'Krata WEMA 100x50cm', unit: 'szt.', category: 'attyka' },
    'krata_wema_50x50': { namePL: 'Krata WEMA 50x50cm', unit: 'szt.', category: 'podest' },
    'angle_bracket_x4': { namePL: 'Kątownik kosza x4 otwory', unit: 'szt.', category: 'kosz', image: 'katownik-x4' },
    'angle_bracket_x3': { namePL: 'Kątownik kosza x3 otwory', unit: 'szt.', category: 'kosz', image: 'katownik-x4' },
    'angle_bracket_x2': { namePL: 'Kątownik kosza x2 otwory', unit: 'szt.', category: 'kosz', image: 'katownik-x4' },
    'bigfoot': { namePL: 'Stopa BIGFOOT', unit: 'szt.', category: 'montaż' },
    'module_connector': { namePL: 'Łącznik modułowy', unit: 'szt.', category: 'łącznik', image: 'lacznik-drabin' }
  }

  // Calculate distances using the same logic as emitUpdate()
  let lastRung1ToGround: number | undefined
  let lastCage1ToGround: number | undefined
  let lastRung2ToGround: number | undefined
  let lastCage2ToGround: number | undefined

  // Calculate last rung to ground for ladder 1
  const distFromGround = props.distanceFromGround || 160
  if (handrailType === 'attic') {
    lastRung1ToGround = distFromGround
  } else {
    lastRung1ToGround = distFromGround + suspendedHeight1
  }

  // Calculate last cage hoop to ground for ladder 1
  if (safetyCageCount1 > 0) {
    const height1 = getTotalHeightForLadder(1)
    const hoopSpacing = 641.7

    let topPosition = height1 / 2
    let firstHoopOffset: number

    if (handrailType === 'safety' || handrailType === 'platform') {
      topPosition += DIMS.handrailVertical
      firstHoopOffset = 25
    } else if (handrailType === 'attic') {
      topPosition += DIMS.atticRailHeight
      firstHoopOffset = 25
    } else {
      firstHoopOffset = 294.3
    }

    const hoopHeight = 45
    const lastHoopY = topPosition - firstHoopOffset - ((safetyCageCount1 - 1) * hoopSpacing) - hoopHeight

    const ladderTop = height1 / 2
    let topOffset = -161
    if (handrailType === 'platform') {
      topOffset = -211
    } else if (handrailType === 'attic') {
      const atticDist = props.atticPlatformDistance ?? 0
      topOffset = -161 + 511 - atticDist
    }
    const groundLevel = ladderTop - wallHeightConfig + topOffset

    lastCage1ToGround = Math.round(lastHoopY - groundLevel + suspendedHeight1)
  }

  function countsToItems(counts: Record<string, { count: number; details?: string }>): BOMItem[] {
    const items: BOMItem[] = []
    let itemId = 0
    for (const [key, data] of Object.entries(counts)) {
      const def = itemDefinitions[key]
      if (def && data.count > 0) {
        items.push({
          id: `item_${++itemId}`,
          name: key,
          namePL: def.namePL,
          quantity: data.count,
          unit: def.unit,
          category: def.category,
          details: data.details,
          image: def.image
        })
      }
    }
    // Sort by specific order
    const itemOrder: Record<string, number> = {
      // Poręcze / przełaz attykowy na górze
      'handrail': 1,
      'attic_passage': 2,
      // Początkowy moduł
      'drabina_poczatkowa_7': 10,
      // Moduły powielane
      'ladder_x7': 20,
      'ladder_x8': 21,
      // Moduły końcowe
      'ladder_final_x7': 25,  // Drabina końcowa 7-szczeblowa
      'ladder_x1': 30,
      'ladder_x2': 31,
      'ladder_x3': 32,
      'ladder_x4': 33,
      'ladder_x5': 34,
      'ladder_x6': 35,
      // Obręcze
      'cage_hoop': 40,
      // Kątowniki
      'angle_bracket_x4': 50,
      'angle_bracket_x3': 51,
      'angle_bracket_x2': 52,
      // Uchwyty drabinowe
      'connector_uchwyt': 60,
      // Ściskane
      'connector_sciskany': 70,
      // Wsporniki
      'wspornik_krotki': 80,
      'wspornik_sredni': 81,
      'wspornik_dlugi': 82,
      // Łączniki drabinowe / elementy łączące
      'element_laczacy': 90,
      'module_connector': 91,
      // Łączniki poręczy
      'handrail_connector': 100,
      'katownik_podestu': 101,
      // Zamykanie, podest spoczynkowy
      'cage_closing': 110,
      'resting_platform': 120,
      // Bigfoot
      'bigfoot': 130,
      // Krata WEMA
      'krata_wema_100x50': 140,
      'krata_wema_50x50': 141,
    }
    items.sort((a, b) => {
      const orderA = itemOrder[a.name] ?? 999
      const orderB = itemOrder[b.name] ?? 999
      return orderA - orderB
    })
    return items
  }

  const bomData: BOMData = {
    ladder1: {
      items: countsToItems(counts1),
      config: {
        wallHeight: wallHeightConfig / 1000,
        scheme: handrailType,
        cage: safetyCageCount1 > 0 ? `${safetyCageCount1} obręczy` : 'brak',
        insulationThickness: 0, // Will be filled from props
        wspornikType: defaultWspornik1,
        wspornikDistance: globalWspornikDistance1,
        lastRungToGround: lastRung1ToGround,
        lastCageToGround: lastCage1ToGround
      }
    },
    generatedAt: new Date()
  }

  // Add ladder 2 if it exists (attic passage)
  if (Object.keys(counts2).length > 0) {
    bomData.ladder2 = {
      items: countsToItems(counts2),
      config: {
        wallHeight: 0, // Will be filled from props
        mountType: props.descentMountType || 'bigfoot',
        insulationThickness: 0, // Will be filled from props
        wspornikType: defaultWspornik2,
        wspornikDistance: globalWspornikDistance2,
        minDistance: 0, // Will be filled from props
        lastRungToGround: lastRung2ToGround,
        lastCageToGround: lastCage2ToGround
      }
    }
  }

  return bomData
}

/**
 * Collect all existing scene objects and add them to debugEditorObjects
 * This allows editing existing ladder elements
 */
function collectSceneObjects(): void {
  if (!ladderContainer) return

  // Clear only added objects (remove existing references as they will be re-collected)
  const nonExistingObjects = debugEditorObjects.filter(o => o.type !== 'existing')

  // Remove non-existing objects from scene
  for (const obj of nonExistingObjects) {
    if (obj.object.parent === ladderContainer) {
      ladderContainer.remove(obj.object)
    }
  }

  // Clear array and keep only non-existing (will refresh existing)
  debugEditorObjects = []

  // Traverse all children in ladderContainer
  ladderContainer.traverse((child) => {
    // Skip the container itself, helper objects, and outline objects
    if (child === ladderContainer) return
    if (child.userData.isOutline) return
    if (child.userData.isMeasureObject) return
    if (child.userData.isGreenCollisionBox) return
    if (child.userData.isCollisionZone) return
    if (child.userData.isMidRungBox) return
    if (child.userData.isSciskaneBox) return
    if (child.userData.isSciskanePreview) return
    if (child.type === 'Line' || child.type === 'LineSegments') return

    // Skip if already in debugEditorObjects
    if (child.userData.debugObjectId) return

    // Only get top-level groups and meshes
    if (child.parent !== ladderContainer) return

    // Determine object name from userData
    let objName = 'Object'
    if (child.userData.isConnector) {
      objName = `Łącznik (${child.userData.connectorType || 'uchwyt'})`
    } else if (child.userData.isWspornik) {
      objName = `Wspornik (${child.userData.wspornikType || 'krotki'})`
    } else if (child.userData.isLadderModule) {
      objName = `Moduł drabiny (${child.userData.rungs || 7} szczebli)`
    } else if (child.userData.isHandrail) {
      objName = 'Poręcz'
    } else if (child.userData.isCageHoop) {
      objName = 'Obręcz kosza'
    } else if (child.userData.isPlatform) {
      objName = 'Podest'
    } else if (child.userData.isWall) {
      objName = 'Ściana'
    } else if (child.userData.isGround) {
      objName = 'Podłoga'
    } else if (child.name) {
      objName = child.name
    } else if ((child as THREE.Mesh).geometry) {
      objName = `Mesh`
    } else if ((child as THREE.Group).isGroup) {
      objName = `Group`
    }

    const id = `existing_${++debugObjectIdCounter}`
    child.userData.debugObjectId = id

    const debugObj: DebugObject = {
      id,
      name: objName,
      type: 'existing' as any, // Mark as existing scene object
      object: child,
      position: {
        x: child.position.x / SCALE,
        y: child.position.y / SCALE,
        z: child.position.z / SCALE
      },
      rotation: {
        x: child.rotation.x * 180 / Math.PI,
        y: child.rotation.y * 180 / Math.PI,
        z: child.rotation.z * 180 / Math.PI
      },
      scale: {
        x: child.scale.x / SCALE,
        y: child.scale.y / SCALE,
        z: child.scale.z / SCALE
      }
    }

    debugEditorObjects.push(debugObj)
  })
}

/**
 * Delete an existing scene object (removes from scene completely)
 * Does NOT dispose geometry/materials to allow undo
 */
function deleteSceneObject(id: string): boolean {
  const index = debugEditorObjects.findIndex(o => o.id === id)
  if (index === -1) return false

  const debugObj = debugEditorObjects[index]

  // Record history for undo
  recordDeleteAction(debugObj)

  // Remove from scene (but don't dispose - we might undo)
  if (debugObj.object.parent) {
    debugObj.object.parent.remove(debugObj.object)
  }

  // Remove from array
  debugEditorObjects.splice(index, 1)

  // Clear selection if this object was selected
  if (selectedDebugObject?.id === id) {
    selectedDebugObject = null
    if (transformControls) {
      transformControls.detach()
      transformControls.getHelper().visible = false
    }
  }

  return true
}

// ============================================
// UNDO/REDO FUNCTIONS
// ============================================

function recordMoveAction(objectId: string, prevPos: { x: number; y: number; z: number }, prevRot: { x: number; y: number; z: number }, newPos: { x: number; y: number; z: number }, newRot: { x: number; y: number; z: number }) {
  if (isUndoingOrRedoing) return

  // Don't record if position didn't actually change
  if (prevPos.x === newPos.x && prevPos.y === newPos.y && prevPos.z === newPos.z &&
      prevRot.x === newRot.x && prevRot.y === newRot.y && prevRot.z === newRot.z) {
    return
  }

  const action: HistoryAction = {
    type: 'move',
    objectId,
    previousPosition: { ...prevPos },
    previousRotation: { ...prevRot },
    newPosition: { ...newPos },
    newRotation: { ...newRot }
  }

  undoStack.push(action)
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift()
  }
  redoStack = [] // Clear redo stack on new action
}

function recordDeleteAction(debugObj: DebugObject) {
  if (isUndoingOrRedoing) return

  const action: HistoryAction = {
    type: 'delete',
    objectId: debugObj.id,
    objectData: {
      name: debugObj.name,
      type: debugObj.type,
      object: debugObj.object,
      position: { ...debugObj.position },
      rotation: { ...debugObj.rotation },
      scale: { ...debugObj.scale },
      color: debugObj.color,
      dimensions: debugObj.dimensions ? { ...debugObj.dimensions } : undefined
    }
  }

  undoStack.push(action)
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift()
  }
  redoStack = []
}

function undo(): boolean {
  if (undoStack.length === 0) return false

  const action = undoStack.pop()!
  isUndoingOrRedoing = true

  try {
    if (action.type === 'move') {
      const debugObj = debugEditorObjects.find(o => o.id === action.objectId)
      if (debugObj && action.previousPosition && action.previousRotation) {
        debugObj.position = { ...action.previousPosition }
        debugObj.rotation = { ...action.previousRotation }
        debugObj.object.position.set(
          action.previousPosition.x * SCALE,
          action.previousPosition.y * SCALE,
          action.previousPosition.z * SCALE
        )
        debugObj.object.rotation.set(
          action.previousRotation.x * Math.PI / 180,
          action.previousRotation.y * Math.PI / 180,
          action.previousRotation.z * Math.PI / 180
        )

        // Emit update
        emit('debugObjectUpdated', {
          id: debugObj.id,
          position: debugObj.position,
          rotation: debugObj.rotation
        })
      }
    } else if (action.type === 'delete' && action.objectData) {
      // Restore deleted object
      const data = action.objectData

      // Re-add to scene
      if (ladderContainer && data.object) {
        ladderContainer.add(data.object)

        // Restore position/rotation
        data.object.position.set(
          data.position.x * SCALE,
          data.position.y * SCALE,
          data.position.z * SCALE
        )
        data.object.rotation.set(
          data.rotation.x * Math.PI / 180,
          data.rotation.y * Math.PI / 180,
          data.rotation.z * Math.PI / 180
        )

        // Re-add to debugEditorObjects
        const restoredObj: DebugObject = {
          id: action.objectId,
          name: data.name,
          type: data.type,
          object: data.object,
          position: { ...data.position },
          rotation: { ...data.rotation },
          scale: { ...data.scale },
          color: data.color,
          dimensions: data.dimensions
        }
        debugEditorObjects.push(restoredObj)
      }
    }

    redoStack.push(action)
    return true
  } finally {
    isUndoingOrRedoing = false
  }
}

function redo(): boolean {
  if (redoStack.length === 0) return false

  const action = redoStack.pop()!
  isUndoingOrRedoing = true

  try {
    if (action.type === 'move') {
      const debugObj = debugEditorObjects.find(o => o.id === action.objectId)
      if (debugObj && action.newPosition && action.newRotation) {
        debugObj.position = { ...action.newPosition }
        debugObj.rotation = { ...action.newRotation }
        debugObj.object.position.set(
          action.newPosition.x * SCALE,
          action.newPosition.y * SCALE,
          action.newPosition.z * SCALE
        )
        debugObj.object.rotation.set(
          action.newRotation.x * Math.PI / 180,
          action.newRotation.y * Math.PI / 180,
          action.newRotation.z * Math.PI / 180
        )

        // Emit update
        emit('debugObjectUpdated', {
          id: debugObj.id,
          position: debugObj.position,
          rotation: debugObj.rotation
        })
      }
    } else if (action.type === 'delete') {
      // Re-delete the object
      const index = debugEditorObjects.findIndex(o => o.id === action.objectId)
      if (index !== -1) {
        const debugObj = debugEditorObjects[index]
        if (debugObj.object.parent) {
          debugObj.object.parent.remove(debugObj.object)
        }
        debugEditorObjects.splice(index, 1)

        if (selectedDebugObject?.id === action.objectId) {
          selectedDebugObject = null
          if (transformControls) {
            transformControls.detach()
            transformControls.getHelper().visible = false
          }
        }
      }
    }

    undoStack.push(action)
    return true
  } finally {
    isUndoingOrRedoing = false
  }
}

function canUndo(): boolean {
  return undoStack.length > 0
}

function canRedo(): boolean {
  return redoStack.length > 0
}

function clearHistory(): void {
  undoStack = []
  redoStack = []
}

// ============================================
// ALIGN MODE (Fusion-style snap/align)
// ============================================

function startAlignMode(): void {
  if (!selectedDebugObject) return

  alignMode = true
  alignStep = 'select-face'
  alignSelectedFace = null

  // Disable transform controls when in align mode
  if (transformControls) {
    transformControls.detach()
    transformControls.getHelper().visible = false
    transformControls.enabled = false
  }
}

function cancelAlignMode(): void {
  alignMode = false
  alignStep = 'done'
  alignSelectedFace = null
  clearAlignFaceHelper()
  clearAlignPreviewSphere()
}

function getAlignState(): { mode: boolean; step: string } {
  return {
    mode: alignMode,
    step: alignStep
  }
}

/**
 * Clear the face highlight helper
 */
function clearAlignFaceHelper(): void {
  if (alignFaceHelper) {
    if (alignFaceHelper.parent) {
      alignFaceHelper.parent.remove(alignFaceHelper)
    }
    alignFaceHelper.geometry.dispose()
    ;(alignFaceHelper.material as THREE.Material).dispose()
    alignFaceHelper = null
  }
}

/**
 * Clear the align preview sphere
 */
function clearAlignPreviewSphere(): void {
  if (alignPreviewSphere && ladderContainer) {
    ladderContainer.remove(alignPreviewSphere)
    alignPreviewSphere.geometry.dispose()
    ;(alignPreviewSphere.material as THREE.Material).dispose()
    alignPreviewSphere = null
  }
  alignCurrentSnapPoint = null
}

/**
 * Update align preview sphere on mouse move (shows snap point)
 */
function updateAlignPreview(clientX: number, clientY: number): void {
  if (!alignMode || alignStep !== 'select-target' || !selectedDebugObject) {
    clearAlignPreviewSphere()
    return
  }

  if (!renderer || !perspectiveCamera || !ladderContainer || !raycaster) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, perspectiveCamera)

  const intersects = raycaster.intersectObjects(ladderContainer.children, true)

  // Find first valid intersection (not the selected object, not helpers)
  let validIntersect: THREE.Intersection | null = null
  for (const intersect of intersects) {
    const obj = intersect.object
    if (obj.userData.isMeasureObject) continue
    if (obj.userData.isOutline) continue
    if (obj === alignFaceHelper) continue
    if (obj === alignPreviewSphere) continue
    if (!obj.visible) continue

    // Skip the selected object
    let isSelectedObj = false
    let checkObj: THREE.Object3D | null = obj
    while (checkObj) {
      if (checkObj === selectedDebugObject.object) {
        isSelectedObj = true
        break
      }
      checkObj = checkObj.parent
    }
    if (isSelectedObj) continue

    validIntersect = intersect
    break
  }

  if (!validIntersect) {
    clearAlignPreviewSphere()
    alignCurrentSnapPoint = null
    return
  }

  // Find snap point
  const snapPoint = findSnapPoint(validIntersect.point, validIntersect.object)
  const finalPoint = snapPoint || validIntersect.point
  const isSnapped = !!snapPoint

  // Store the current snap point in world coordinates for use when clicking
  alignCurrentSnapPoint = finalPoint.clone()

  // Convert to local coordinates for display
  const localPoint = finalPoint.clone()
  ladderContainer.worldToLocal(localPoint)

  // Create or update sphere
  const sphereRadius = perspectiveCamera.position.z * 0.008

  if (!alignPreviewSphere) {
    const geometry = new THREE.SphereGeometry(sphereRadius, 16, 16)
    const material = new THREE.MeshBasicMaterial({
      color: isSnapped ? 0x00ff00 : 0xffff00,
      transparent: true,
      opacity: 0.8,
      depthTest: false
    })
    alignPreviewSphere = new THREE.Mesh(geometry, material)
    alignPreviewSphere.renderOrder = 1000
    ladderContainer.add(alignPreviewSphere)
  }

  alignPreviewSphere.position.copy(localPoint)

  // Update geometry size
  alignPreviewSphere.geometry.dispose()
  alignPreviewSphere.geometry = new THREE.SphereGeometry(sphereRadius, 16, 16)

  // Update color based on snap
  const mat = alignPreviewSphere.material as THREE.MeshBasicMaterial
  mat.color.setHex(isSnapped ? 0x00ff00 : 0xffff00)
}

/**
 * Create a visual helper to show selected face - attached to the object itself
 */
function showAlignFaceHelper(obj: THREE.Object3D, axis: 'x' | 'y' | 'z', side: 'min' | 'max'): void {
  clearAlignFaceHelper()

  // Get bounding box in LOCAL coordinates of the object
  const localBox = new THREE.Box3()

  // Calculate local bounding box by examining geometry
  obj.traverse((child) => {
    if ((child as THREE.Mesh).geometry) {
      const geom = (child as THREE.Mesh).geometry
      if (!geom.boundingBox) geom.computeBoundingBox()
      if (geom.boundingBox) {
        const childBox = geom.boundingBox.clone()
        // Transform by child's local matrix relative to obj
        const childWorldMatrix = child.matrixWorld.clone()
        const objWorldMatrixInv = obj.matrixWorld.clone().invert()
        const localMatrix = childWorldMatrix.premultiply(objWorldMatrixInv)
        childBox.applyMatrix4(localMatrix)
        localBox.union(childBox)
      }
    }
  })

  // If empty, try setFromObject approach
  if (localBox.isEmpty()) {
    localBox.setFromObject(obj)
    // Convert to local space
    const worldCenter = new THREE.Vector3()
    localBox.getCenter(worldCenter)
    obj.worldToLocal(worldCenter)
    const size = new THREE.Vector3()
    localBox.getSize(size)
    localBox.setFromCenterAndSize(worldCenter, size)
  }

  const size = new THREE.Vector3()
  localBox.getSize(size)
  const center = new THREE.Vector3()
  localBox.getCenter(center)

  let width: number, height: number
  const facePos = new THREE.Vector3()

  // Calculate face center position and plane dimensions
  if (axis === 'x') {
    width = size.z
    height = size.y
    facePos.set(side === 'min' ? localBox.min.x : localBox.max.x, center.y, center.z)
  } else if (axis === 'y') {
    width = size.x
    height = size.z
    facePos.set(center.x, side === 'min' ? localBox.min.y : localBox.max.y, center.z)
  } else {
    width = size.x
    height = size.y
    facePos.set(center.x, center.y, side === 'min' ? localBox.min.z : localBox.max.z)
  }

  // Add small offset so plane is visible (not z-fighting)
  const offset = 0.001
  if (axis === 'x') facePos.x += (side === 'min' ? -offset : offset)
  if (axis === 'y') facePos.y += (side === 'min' ? -offset : offset)
  if (axis === 'z') facePos.z += (side === 'min' ? -offset : offset)

  const geometry = new THREE.PlaneGeometry(width, height)
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthTest: false
  })

  alignFaceHelper = new THREE.Mesh(geometry, material)
  alignFaceHelper.position.copy(facePos)

  // Rotate plane to face correct direction
  if (axis === 'x') {
    alignFaceHelper.rotation.y = Math.PI / 2
  } else if (axis === 'y') {
    alignFaceHelper.rotation.x = -Math.PI / 2
  }

  alignFaceHelper.renderOrder = 999

  // Add as child of the object so it moves with it
  obj.add(alignFaceHelper)
}

/**
 * Detect which face was clicked using the face normal from raycast
 * This correctly handles rotated objects by using local coordinates
 */
function detectClickedFace(
  obj: THREE.Object3D,
  hitPointWorld: THREE.Vector3,
  faceNormal: THREE.Vector3 | null,
  hitObject: THREE.Object3D
): { axis: 'x' | 'y' | 'z'; side: 'min' | 'max'; position: number } | null {

  let axis: 'x' | 'y' | 'z'
  let side: 'min' | 'max'

  if (faceNormal) {
    // Transform the face normal from hit object's local space to world space using quaternion
    const worldNormal = faceNormal.clone()
    const hitQuaternion = new THREE.Quaternion()
    hitObject.getWorldQuaternion(hitQuaternion)
    worldNormal.applyQuaternion(hitQuaternion).normalize()

    // Transform from world space to the main object's local space
    const objQuaternion = new THREE.Quaternion()
    obj.getWorldQuaternion(objQuaternion)
    const objQuatInverse = objQuaternion.clone().invert()
    const localNormal = worldNormal.clone().applyQuaternion(objQuatInverse).normalize()

    // Determine which local axis the normal is most aligned with
    const absX = Math.abs(localNormal.x)
    const absY = Math.abs(localNormal.y)
    const absZ = Math.abs(localNormal.z)

    if (absX >= absY && absX >= absZ) {
      axis = 'x'
      side = localNormal.x > 0 ? 'max' : 'min'
    } else if (absY >= absX && absY >= absZ) {
      axis = 'y'
      side = localNormal.y > 0 ? 'max' : 'min'
    } else {
      axis = 'z'
      side = localNormal.z > 0 ? 'max' : 'min'
    }
  } else {
    // Fallback: use hit point relative to object center
    const localHit = hitPointWorld.clone()
    obj.worldToLocal(localHit)

    // Get local bounding box
    const localBox = new THREE.Box3()
    obj.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        const geom = (child as THREE.Mesh).geometry
        if (!geom.boundingBox) geom.computeBoundingBox()
        if (geom.boundingBox) {
          const childBox = geom.boundingBox.clone()
          const childWorldMatrix = child.matrixWorld.clone()
          const objWorldMatrixInv = obj.matrixWorld.clone().invert()
          const localMatrix = childWorldMatrix.premultiply(objWorldMatrixInv)
          childBox.applyMatrix4(localMatrix)
          localBox.union(childBox)
        }
      }
    })

    if (localBox.isEmpty()) {
      return null
    }

    // Calculate distances to each face in local space
    const distances = {
      xMin: Math.abs(localHit.x - localBox.min.x),
      xMax: Math.abs(localHit.x - localBox.max.x),
      yMin: Math.abs(localHit.y - localBox.min.y),
      yMax: Math.abs(localHit.y - localBox.max.y),
      zMin: Math.abs(localHit.z - localBox.min.z),
      zMax: Math.abs(localHit.z - localBox.max.z)
    }

    const entries: [string, number][] = Object.entries(distances)
    entries.sort((a, b) => a[1] - b[1])
    const closest = entries[0][0]

    if (closest === 'xMin') { axis = 'x'; side = 'min' }
    else if (closest === 'xMax') { axis = 'x'; side = 'max' }
    else if (closest === 'yMin') { axis = 'y'; side = 'min' }
    else if (closest === 'yMax') { axis = 'y'; side = 'max' }
    else if (closest === 'zMin') { axis = 'z'; side = 'min' }
    else { axis = 'z'; side = 'max' }
  }

  // Get local bounding box to determine position
  const localBox = new THREE.Box3()
  obj.traverse((child) => {
    if ((child as THREE.Mesh).geometry) {
      const geom = (child as THREE.Mesh).geometry
      if (!geom.boundingBox) geom.computeBoundingBox()
      if (geom.boundingBox) {
        const childBox = geom.boundingBox.clone()
        const childWorldMatrix = child.matrixWorld.clone()
        const objWorldMatrixInv = obj.matrixWorld.clone().invert()
        const localMatrix = childWorldMatrix.premultiply(objWorldMatrixInv)
        childBox.applyMatrix4(localMatrix)
        localBox.union(childBox)
      }
    }
  })

  let position: number
  if (axis === 'x') position = side === 'min' ? localBox.min.x : localBox.max.x
  else if (axis === 'y') position = side === 'min' ? localBox.min.y : localBox.max.y
  else position = side === 'min' ? localBox.min.z : localBox.max.z

  return { axis, side, position }
}

/**
 * Handle face selection (step 1)
 */
function handleAlignFaceSelection(hitPoint: THREE.Vector3, faceNormal: THREE.Vector3 | null, hitObject: THREE.Object3D): boolean {
  if (!selectedDebugObject || alignStep !== 'select-face') return false

  const face = detectClickedFace(selectedDebugObject.object, hitPoint, faceNormal, hitObject)
  if (!face) return false

  alignSelectedFace = face
  alignStep = 'select-target'

  // Show visual helper on the object
  showAlignFaceHelper(selectedDebugObject.object, face.axis, face.side)

  return true
}

/**
 * Perform alignment (step 2) - move object so selected face aligns with target point
 * Uses LOCAL coordinate system for face detection, then transforms to world for movement
 */
function performAlignment(targetPoint: THREE.Vector3): boolean {
  if (!selectedDebugObject || !alignSelectedFace || alignStep !== 'select-target') return false

  const obj = selectedDebugObject.object
  const prevPos = { ...selectedDebugObject.position }
  const prevRot = { ...selectedDebugObject.rotation }

  const axis = alignSelectedFace.axis
  const side = alignSelectedFace.side

  // Calculate local bounding box
  const localBox = new THREE.Box3()
  obj.traverse((child) => {
    if ((child as THREE.Mesh).geometry) {
      const geom = (child as THREE.Mesh).geometry
      if (!geom.boundingBox) geom.computeBoundingBox()
      if (geom.boundingBox) {
        const childBox = geom.boundingBox.clone()
        const childWorldMatrix = child.matrixWorld.clone()
        const objWorldMatrixInv = obj.matrixWorld.clone().invert()
        const localMatrix = childWorldMatrix.premultiply(objWorldMatrixInv)
        childBox.applyMatrix4(localMatrix)
        localBox.union(childBox)
      }
    }
  })

  if (localBox.isEmpty()) {
    localBox.setFromObject(obj)
    const worldCenter = new THREE.Vector3()
    localBox.getCenter(worldCenter)
    obj.worldToLocal(worldCenter)
    const size = new THREE.Vector3()
    localBox.getSize(size)
    localBox.setFromCenterAndSize(worldCenter, size)
  }

  // Get face center point in LOCAL coordinates
  const localFaceCenter = new THREE.Vector3()
  localBox.getCenter(localFaceCenter)

  if (axis === 'x') {
    localFaceCenter.x = side === 'min' ? localBox.min.x : localBox.max.x
  } else if (axis === 'y') {
    localFaceCenter.y = side === 'min' ? localBox.min.y : localBox.max.y
  } else {
    localFaceCenter.z = side === 'min' ? localBox.min.z : localBox.max.z
  }

  // Transform face center from local to world coordinates
  const worldFaceCenter = localFaceCenter.clone()
  obj.localToWorld(worldFaceCenter)

  // Create local axis direction vector
  const localAxisDir = new THREE.Vector3()
  if (axis === 'x') localAxisDir.set(1, 0, 0)
  else if (axis === 'y') localAxisDir.set(0, 1, 0)
  else localAxisDir.set(0, 0, 1)

  // Transform axis direction to world space using quaternion (more accurate than normal matrix)
  const worldAxisDir = localAxisDir.clone()
  const objQuaternion = new THREE.Quaternion()
  obj.getWorldQuaternion(objQuaternion)
  worldAxisDir.applyQuaternion(objQuaternion).normalize()

  // Calculate the signed distance we need to move along the axis
  // Project both points onto the axis and find the difference
  const faceProjection = worldFaceCenter.dot(worldAxisDir)
  const targetProjection = targetPoint.dot(worldAxisDir)
  const moveDistance = targetProjection - faceProjection

  // Create world movement vector along the axis
  const worldMove = worldAxisDir.clone().multiplyScalar(moveDistance)

  // Transform the movement from world space to parent's local space using quaternion
  const parent = obj.parent
  if (parent) {
    parent.updateWorldMatrix(true, false)
    const parentQuaternion = new THREE.Quaternion()
    parent.getWorldQuaternion(parentQuaternion)
    parentQuaternion.invert()
    worldMove.applyQuaternion(parentQuaternion)
  }

  // Apply local movement to object position
  obj.position.add(worldMove)

  // Update debug object position tracking
  selectedDebugObject.position.x = obj.position.x / SCALE
  selectedDebugObject.position.y = obj.position.y / SCALE
  selectedDebugObject.position.z = obj.position.z / SCALE

  // Record for undo
  recordMoveAction(
    selectedDebugObject.id,
    prevPos,
    prevRot,
    selectedDebugObject.position,
    selectedDebugObject.rotation
  )

  // Emit update
  emit('debugObjectUpdated', {
    id: selectedDebugObject.id,
    position: selectedDebugObject.position,
    rotation: selectedDebugObject.rotation
  })

  // Done - reset align mode
  clearAlignFaceHelper()
  clearAlignPreviewSphere()
  alignMode = false
  alignStep = 'done'
  alignSelectedFace = null

  return true
}

// ============================================
// EXTRUDE MODE (Fusion-style push/pull)
// ============================================

function startExtrudeMode(): void {
  if (!selectedDebugObject) return
  extrudeMode = true
  extrudeActive = false
  extrudeFace = null
  // Cancel other modes
  alignMode = false
  alignStep = 'done'
  cancelAlignMode()
}

function cancelExtrudeMode(): void {
  extrudeMode = false
  extrudeActive = false
  extrudeFace = null
  extrudeStartPoint = null
  extrudeStartSize = null
  extrudeStartPos = null
  clearExtrudeHelpers()
}

function getExtrudeState(): { mode: boolean; active: boolean } {
  return {
    mode: extrudeMode,
    active: extrudeActive
  }
}

function clearExtrudeHelpers(): void {
  if (extrudeFaceHelper && ladderContainer) {
    ladderContainer.remove(extrudeFaceHelper)
    extrudeFaceHelper.geometry.dispose()
    ;(extrudeFaceHelper.material as THREE.Material).dispose()
    extrudeFaceHelper = null
  }
  if (extrudeAxisHelper && ladderContainer) {
    ladderContainer.remove(extrudeAxisHelper)
    extrudeAxisHelper.geometry.dispose()
    ;(extrudeAxisHelper.material as THREE.Material).dispose()
    extrudeAxisHelper = null
  }
}

/**
 * Show visual helper for extrude face and axis
 */
function showExtrudeFaceHelper(obj: THREE.Object3D, axis: 'x' | 'y' | 'z', side: 'min' | 'max'): void {
  clearExtrudeHelpers()

  // Get local bounding box
  const localBox = new THREE.Box3()
  obj.traverse((child) => {
    if ((child as THREE.Mesh).geometry) {
      const geom = (child as THREE.Mesh).geometry
      if (!geom.boundingBox) geom.computeBoundingBox()
      if (geom.boundingBox) {
        const childBox = geom.boundingBox.clone()
        const childWorldMatrix = child.matrixWorld.clone()
        const objWorldMatrixInv = obj.matrixWorld.clone().invert()
        const localMatrix = childWorldMatrix.premultiply(objWorldMatrixInv)
        childBox.applyMatrix4(localMatrix)
        localBox.union(childBox)
      }
    }
  })

  if (localBox.isEmpty()) return

  const size = new THREE.Vector3()
  localBox.getSize(size)
  const center = new THREE.Vector3()
  localBox.getCenter(center)

  let width: number, height: number
  const facePos = new THREE.Vector3()

  if (axis === 'x') {
    width = size.z
    height = size.y
    facePos.set(side === 'min' ? localBox.min.x : localBox.max.x, center.y, center.z)
  } else if (axis === 'y') {
    width = size.x
    height = size.z
    facePos.set(center.x, side === 'min' ? localBox.min.y : localBox.max.y, center.z)
  } else {
    width = size.x
    height = size.y
    facePos.set(center.x, center.y, side === 'min' ? localBox.min.z : localBox.max.z)
  }

  // Face helper (orange for extrude)
  const faceGeom = new THREE.PlaneGeometry(width, height)
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthTest: false
  })

  extrudeFaceHelper = new THREE.Mesh(faceGeom, faceMat)
  extrudeFaceHelper.position.copy(facePos)

  if (axis === 'x') {
    extrudeFaceHelper.rotation.y = Math.PI / 2
  } else if (axis === 'y') {
    extrudeFaceHelper.rotation.x = -Math.PI / 2
  }

  extrudeFaceHelper.renderOrder = 999
  obj.add(extrudeFaceHelper)

  // Axis helper line (shows direction of extrusion)
  const axisDir = new THREE.Vector3()
  if (axis === 'x') axisDir.set(side === 'min' ? -1 : 1, 0, 0)
  else if (axis === 'y') axisDir.set(0, side === 'min' ? -1 : 1, 0)
  else axisDir.set(0, 0, side === 'min' ? -1 : 1)

  const lineLength = Math.max(size.x, size.y, size.z) * 2
  const lineEnd = facePos.clone().add(axisDir.clone().multiplyScalar(lineLength))

  const lineGeom = new THREE.BufferGeometry().setFromPoints([facePos, lineEnd])
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff8800, linewidth: 2, depthTest: false })
  extrudeAxisHelper = new THREE.Line(lineGeom, lineMat)
  extrudeAxisHelper.renderOrder = 999
  obj.add(extrudeAxisHelper)
}

/**
 * Handle mouse down for extrude - detect face and start dragging
 */
function handleExtrudeMouseDown(_event: MouseEvent, intersect: THREE.Intersection): boolean {
  if (!extrudeMode || !selectedDebugObject) return false

  // Check if clicking on the selected object
  let isSelectedObj = false
  let checkObj: THREE.Object3D | null = intersect.object
  while (checkObj) {
    if (checkObj === selectedDebugObject.object) {
      isSelectedObj = true
      break
    }
    checkObj = checkObj.parent
  }

  if (!isSelectedObj) return false

  // Detect which face was clicked
  const face = detectClickedFace(
    selectedDebugObject.object,
    intersect.point,
    intersect.face?.normal || null,
    intersect.object
  )

  if (!face) return false

  extrudeFace = { axis: face.axis, side: face.side }
  extrudeActive = true
  extrudeStartPoint = intersect.point.clone()

  // Store starting size and position
  const obj = selectedDebugObject.object
  if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BoxGeometry) {
    const params = obj.geometry.parameters
    extrudeStartSize = { x: params.width, y: params.height, z: params.depth }
  } else {
    // Fallback: estimate from bounding box
    const box = new THREE.Box3().setFromObject(obj)
    const size = new THREE.Vector3()
    box.getSize(size)
    extrudeStartSize = { x: size.x, y: size.y, z: size.z }
  }
  extrudeStartPos = { x: obj.position.x, y: obj.position.y, z: obj.position.z }

  // Show helper
  showExtrudeFaceHelper(obj, face.axis, face.side)

  return true
}

/**
 * Handle mouse move during extrude drag
 */
function handleExtrudeMouseMove(event: MouseEvent): void {
  if (!extrudeActive || !extrudeFace || !selectedDebugObject || !extrudeStartPoint || !extrudeStartSize || !extrudeStartPos) return
  if (!renderer || !perspectiveCamera || !raycaster) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  // Create a plane perpendicular to view through the start point for dragging
  const obj = selectedDebugObject.object

  // Get extrude axis in world space
  const localAxisDir = new THREE.Vector3()
  if (extrudeFace.axis === 'x') localAxisDir.set(1, 0, 0)
  else if (extrudeFace.axis === 'y') localAxisDir.set(0, 1, 0)
  else localAxisDir.set(0, 0, 1)

  const worldAxisDir = localAxisDir.clone()
  const objQuaternion = new THREE.Quaternion()
  obj.getWorldQuaternion(objQuaternion)
  worldAxisDir.applyQuaternion(objQuaternion).normalize()

  // Create a plane that contains the axis and is visible to the camera
  const cameraDir = new THREE.Vector3()
  perspectiveCamera.getWorldDirection(cameraDir)

  // Plane normal is perpendicular to both axis and camera direction
  let planeNormal = new THREE.Vector3().crossVectors(worldAxisDir, cameraDir)
  if (planeNormal.length() < 0.1) {
    // Axis is parallel to camera direction, use camera up instead
    planeNormal.crossVectors(worldAxisDir, perspectiveCamera.up)
  }
  planeNormal.crossVectors(planeNormal, worldAxisDir).normalize()

  const plane = new THREE.Plane()
  plane.setFromNormalAndCoplanarPoint(planeNormal, extrudeStartPoint)

  // Raycast to plane
  raycaster.setFromCamera(mouse, perspectiveCamera)
  const intersection = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(plane, intersection)) return

  // Calculate distance moved along the extrude axis
  const movement = intersection.clone().sub(extrudeStartPoint)
  let distance = movement.dot(worldAxisDir)

  // Apply direction based on which side of face
  if (extrudeFace.side === 'min') {
    distance = -distance  // Min side moves opposite
  }

  // Calculate new size - minimum size constraint
  const minSize = 0.1
  let newSizeValue = 0

  if (extrudeFace.axis === 'x') {
    newSizeValue = Math.max(minSize, extrudeStartSize.x + distance)
  } else if (extrudeFace.axis === 'y') {
    newSizeValue = Math.max(minSize, extrudeStartSize.y + distance)
  } else {
    newSizeValue = Math.max(minSize, extrudeStartSize.z + distance)
  }

  // Update geometry
  if (obj instanceof THREE.Mesh) {
    const oldGeom = obj.geometry
    let newWidth = extrudeStartSize.x
    let newHeight = extrudeStartSize.y
    let newDepth = extrudeStartSize.z

    if (extrudeFace.axis === 'x') newWidth = newSizeValue
    else if (extrudeFace.axis === 'y') newHeight = newSizeValue
    else newDepth = newSizeValue

    obj.geometry = new THREE.BoxGeometry(newWidth, newHeight, newDepth)
    oldGeom.dispose()

    // Move position to keep opposite face in place
    // The box center moves by half the size change
    const sizeChange = newSizeValue - (extrudeFace.axis === 'x' ? extrudeStartSize.x :
                                        extrudeFace.axis === 'y' ? extrudeStartSize.y :
                                        extrudeStartSize.z)
    const posOffset = sizeChange / 2

    // Transform offset to parent space
    const localOffset = new THREE.Vector3()
    if (extrudeFace.axis === 'x') localOffset.x = extrudeFace.side === 'max' ? posOffset : -posOffset
    else if (extrudeFace.axis === 'y') localOffset.y = extrudeFace.side === 'max' ? posOffset : -posOffset
    else localOffset.z = extrudeFace.side === 'max' ? posOffset : -posOffset

    // Apply object's local rotation to offset
    localOffset.applyQuaternion(obj.quaternion)

    obj.position.set(
      extrudeStartPos.x + localOffset.x,
      extrudeStartPos.y + localOffset.y,
      extrudeStartPos.z + localOffset.z
    )

    // Update face helper
    showExtrudeFaceHelper(obj, extrudeFace.axis, extrudeFace.side)
  }
}

/**
 * Handle mouse up - finish extrude
 */
function handleExtrudeMouseUp(): void {
  if (!extrudeActive || !selectedDebugObject) return

  const obj = selectedDebugObject.object

  // Update the debug object data
  selectedDebugObject.position = {
    x: obj.position.x / SCALE,
    y: obj.position.y / SCALE,
    z: obj.position.z / SCALE
  }

  if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BoxGeometry) {
    const params = obj.geometry.parameters
    selectedDebugObject.scale = {
      x: params.width / SCALE,
      y: params.height / SCALE,
      z: params.depth / SCALE
    }
  }

  // Emit update
  emit('debugObjectUpdated', {
    id: selectedDebugObject.id,
    position: selectedDebugObject.position,
    rotation: selectedDebugObject.rotation,
    scale: selectedDebugObject.scale
  })

  // Reset state but stay in extrude mode
  extrudeActive = false
  extrudeFace = null
  extrudeStartPoint = null
  extrudeStartSize = null
  extrudeStartPos = null
  clearExtrudeHelpers()
}

// ============================================
// PUBLIC METHODS (exposed to parent)
// ============================================
defineExpose({
  createLadder,
  resetCamera: () => {
    targetRotation = { x: 0.35, y: -0.785 }
    currentRotation = { x: 0.35, y: -0.785 }
    cameraOffset = { x: 0, y: 0, z: 0 }
    if (perspectiveCamera) perspectiveCamera.position.z = 80
  },
  setMeasureMode,
  setMeasureAxisMode,
  clearMeasureLine,
  enterTechDrawingMode,
  exitTechDrawingMode,
  toggleTechDrawingView,
  isTechDrawingMode: () => isTechDrawingMode,
  toggleSciskaneMode,
  isSciskaneMode: () => sciskaneMode,
  // Delete mode (seller mode)
  setDeleteMode,
  isDeleteMode: () => deleteMode,
  performDelete,
  restoreDeleted,
  // Hidden elements system
  hideElement,
  showElement,
  clearHiddenElements,
  getHiddenElements,
  setHiddenElements,
  updateSciskaneHandle,
  removeSciskaneHandle,
  updateJointConnector,
  updateMidRungBracket,
  removeMidRungBracket,
  getMidRungBracketState,
  setDebugMode,
  emitDebugInfo,
  isDebugMode: () => debugMode,
  // Kontrola widoczności wymiarów
  setShowMeasurementBoxes,
  getShowMeasurementBoxes,
  setShowDimensions,
  getShowDimensions,
  setGlobalWspornikDistance,
  getGlobalWspornikDistance,
  getWspornikTypeForDistance,
  setWallWidth,
  getWallWidth,
  // Debug editor
  getAvailableModels,
  addDebugModel,
  addDebugBox,
  updateDebugObject,
  removeDebugObject,
  getDebugObjects,
  selectDebugObject,
  getSelectedDebugObject,
  clearAllDebugObjects,
  duplicateDebugObject,
  setTransformMode,
  getTransformMode,
  // Scene object editing
  collectSceneObjects,
  deleteSceneObject,
  // Undo/Redo
  undo,
  redo,
  canUndo,
  canRedo,
  clearHistory,
  // Align mode
  startAlignMode,
  cancelAlignMode,
  getAlignState,
  // Extrude mode
  startExtrudeMode,
  cancelExtrudeMode,
  getExtrudeState,
  // BOM generation
  generateBOM,
  // Zoom controls
  zoomIn: () => {
    if (isTechDrawingMode && orthoCamera) {
      const currentSize = orthoCamera.top
      const newSize = Math.max(1, currentSize * 0.8)
      const container = containerRef.value!
      const aspect = container.clientWidth / container.clientHeight
      orthoCamera.left = -newSize * aspect
      orthoCamera.right = newSize * aspect
      orthoCamera.top = newSize
      orthoCamera.bottom = -newSize
      orthoCamera.updateProjectionMatrix()
      requestRender()
    } else if (perspectiveCamera) {
      perspectiveCamera.position.z = Math.max(3, perspectiveCamera.position.z * 0.8)
      requestRender()
    }
  },
  zoomOut: () => {
    if (isTechDrawingMode && orthoCamera) {
      const currentSize = orthoCamera.top
      const newSize = Math.min(50, currentSize * 1.25)
      const container = containerRef.value!
      const aspect = container.clientWidth / container.clientHeight
      orthoCamera.left = -newSize * aspect
      orthoCamera.right = newSize * aspect
      orthoCamera.top = newSize
      orthoCamera.bottom = -newSize
      orthoCamera.updateProjectionMatrix()
      requestRender()
    } else if (perspectiveCamera) {
      perspectiveCamera.position.z = Math.min(300, perspectiveCamera.position.z * 1.25)
      requestRender()
    }
  }
})
</script>

<template>
  <div ref="containerRef" class="three-canvas"></div>
</template>

<style scoped>
.three-canvas {
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
