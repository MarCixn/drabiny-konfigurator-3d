<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

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
  distanceFromGround?: number  // in mm, default 160
  showWsporniki?: boolean  // Show/hide wspornik models (default true)
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
    lastRungToGround?: number
    lastHoopToGround?: number
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
  'dlugi': 415
}

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
    zOffset: 0,
    rotationZ: 0,
    connector: {
      left: { x: Math.PI * 0.5, y: Math.PI, z: 0 },
      right: { x: Math.PI * 0.5, y: 0, z: 0 },
      zOffset: 0,
      uchwytZOffset: 0
    },
    sciskane: {
      left: { x: Math.PI * 0.5, y: 0, z: Math.PI },
      right: { x: Math.PI * 0.5, y: Math.PI, z: Math.PI },
      leftZOffset: -45,
      rightZOffset: -45
    },
    wspornik: {
      left: { x: 0, y: 0, z: 0 },
      right: { x: 0, y: Math.PI, z: 0 },
      zOffset: -145
    }
  },
  2: {
    zOffset: -1070,
    rotationZ: Math.PI,
    connector: {
      left: { x: Math.PI * 1.5, y: Math.PI, z: 0 },
      right: { x: Math.PI * 1.5, y: 0, z: 0 },
      zOffset: 0,
      uchwytZOffset: 124
    },
    sciskane: {
      left: { x: Math.PI * 0.5, y: Math.PI, z: 0 },
      right: { x: Math.PI * 0.5, y: 0, z: 0 },
      leftZOffset: 44,
      rightZOffset: 44
    },
    wspornik: {
      left: { x: 0, y: Math.PI, z: 0 },
      right: { x: 0, y: 0, z: 0 },
      zOffset: 145
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
let targetRotation = { x: 0, y: 0.3 }
let currentRotation = { x: 0, y: 0.3 }
let cameraOffset = { x: 0, y: 0, z: 0 }
let initialPinchDistance: number | null = null
let lastZoom = 50
let lastPanCenter = { x: 0, y: 0 }
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
  animate()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  isDisposed = true
  window.removeEventListener('resize', handleResize)

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
  props.showWall,
  props.showGround,
  props.showInsulation,
  props.suspended,
  props.suspendedHeight,
  props.cageClosing,
  props.restingPlatform,
  props.distanceFromGround,
  props.showWsporniki,
  props.eave
], () => {
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

function syncPropsToState() {
  numX7Ladders1 = props.numX7Ladders
  finalLadderRungs1 = props.finalLadderRungs
  safetyCageCount1 = props.safetyCageCount
  handrailType = mapSchemeToHandrailType(props.scheme)
  wallHeightConfig = props.wallHeight * 1000  // Convert meters to mm
  showWall = props.showWall
  showGround = props.showGround
  showInsulation = props.showInsulation
  suspendedHeight1 = props.suspended ? props.suspendedHeight * 1000 : 0  // Convert meters to mm
  cageClosing1 = props.cageClosing || false
  restingPlatform1 = props.restingPlatform || false
  obstaclesFromConfigurator = props.obstacles || []

  // Update wspornik settings
  // Always update distance for wall positioning (even when wsporniki hidden)
  if (props.wspornikDistance > 0) {
    globalWspornikDistance1 = props.wspornikDistance
    defaultWspornik1 = getWspornikTypeFromDistance(props.wspornikDistance)
    updateGlobalWspornikDistance(1, props.wspornikDistance)
  }

  if (props.showWsporniki !== false && props.wspornikDistance > 0) {
    wspornikDisabled1 = false
  } else {
    wspornikDisabled1 = true
    if (props.wspornikDistance <= 0) {
      defaultWspornik1 = 'none'
    }
  }

  // Auto-add sciskane handle for final ladders x4-x7 (between last two rungs)
  autoAddSciskaneForKoncowa(finalLadderRungs1, 1)
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
  perspectiveCamera.position.set(0, 0, 50)

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
  }

  function onPointerMove(x: number, y: number) {
    if (!isDragging || isTechDrawingMode) return

    const deltaX = x - previousPosition.x
    const deltaY = y - previousPosition.y

    targetRotation.y += deltaX * 0.005
    targetRotation.x += deltaY * 0.005

    previousPosition = { x, y }
  }

  function onPointerEnd() {
    isDragging = false
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

    // Measure mode - click on any object to add measurement point
    if (measureMode) {
      const intersects = raycaster.intersectObjects(ladderContainer.children, true)

      // Znajdź pierwszy ważny intersect
      for (const intersect of intersects) {
        const obj = intersect.object
        if (obj.userData.isMeasureObject) continue
        if (!obj.visible) continue

        // Sprawdź flagi debug w hierarchii
        let isDebug = false
        let checkObj: THREE.Object3D | null = obj
        while (checkObj) {
          if (checkObj.userData.isGreenCollisionBox ||
              checkObj.userData.isCollisionZone ||
              checkObj.userData.isMidRungBox ||
              checkObj.userData.isSciskaneBox ||
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

    // Sciskane mode - click on preview to add new handle
    if (sciskaneMode) {
      const previewIntersects = raycaster.intersectObjects(sciskanePreviewObjects, true)
      for (const intersect of previewIntersects) {
        let obj = intersect.object as THREE.Object3D
        while (obj.parent && !obj.userData.isSciskanePreview) {
          obj = obj.parent
        }
        if (obj.userData.isSciskanePreview) {
          addSciskaneHandle(obj.userData.previewY, obj.userData.ladderNum || 1)
          return
        }
      }
      // Don't return - continue to check existing handles
    }

    // Always check for existing sciskane handles (can be edited anytime in sciskane mode)
    if (sciskaneMode && sciskanePlacedObjects.length > 0) {
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

    // Check for mid-rung bracket or joint connectors (in sciskane mode)
    if (sciskaneMode) {
      // Check connectors for mid-rung bracket AND joint connectors
      const connIntersects = raycaster.intersectObjects(connectorObjects, true)
      for (const intersect of connIntersects) {
        let obj = intersect.object as THREE.Object3D
        // Find root model that is in connectorObjects array (has pairIndex set)
        while (obj.parent && connectorObjects.indexOf(obj) === -1) {
          obj = obj.parent
        }
        if (obj.userData.isConnector) {
          const ladderNum = obj.userData.ladderNum || 1
          const isMidRung = obj.userData.isMidRungBracket || false
          const pairIndex = obj.userData.pairIndex

          if (isMidRung) {
            // Mid-rung bracket
            const connType = (ladderNum === 1) ? midRungBracketConnType1 : midRungBracketConnType2
            const wspornikType = (ladderNum === 1) ? midRungBracketWspornikType1 : midRungBracketWspornikType2
            const wspornikDistance = (ladderNum === 1) ? midRungBracketDistance1 : midRungBracketDistance2
            emit('editSciskaneHandle', {
              offsetFromBottom: -1, // Special marker for mid-rung
              ladderNum,
              connType,
              wspornikType,
              wspornikDistance,
              isMidRung: true
            } as any)
          } else {
            // Joint connector - read from arrays
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
              offsetFromBottom: -1, // Special marker for joint connector
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
      }

      // Also check wsporniki in sciskane mode
      const wspIntersects = raycaster.intersectObjects(wspornikObjects, true)
      for (const intersect of wspIntersects) {
        let obj = intersect.object as THREE.Object3D
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
    if (e.shiftKey || e.button === 1) {
      // Shift or middle button = pan
      isPanning = true
      previousPosition = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    } else {
      onPointerStart(e.clientX, e.clientY)
    }
  })

  dom.addEventListener('mousemove', (e) => {
    if (isTechDrawingMode) return  // Block in tech drawing mode

    // Update measure preview when in measure mode
    if (measureMode && !isPanning && !isDragging) {
      updateMeasurePreview(e.clientX, e.clientY)
    }

    if (isPanning) {
      const deltaX = e.clientX - previousPosition.x
      const deltaY = e.clientY - previousPosition.y

      const panScale = camera.position.z * 0.00075
      cameraOffset.x -= deltaX * panScale
      cameraOffset.y += deltaY * panScale

      previousPosition = { x: e.clientX, y: e.clientY }
    } else {
      onPointerMove(e.clientX, e.clientY)
    }
  })

  dom.addEventListener('mouseup', (e) => {
    if (!isPanning) {
      handlePotentialClick(e.clientX, e.clientY)
    }
    isPanning = false
    onPointerEnd()
  })

  dom.addEventListener('mouseleave', () => {
    isPanning = false
    onPointerEnd()
  })

  // Wheel zoom
  dom.addEventListener('wheel', (e) => {
    if (isTechDrawingMode) return  // Block in tech drawing mode
    e.preventDefault()
    perspectiveCamera.position.z *= (1 + e.deltaY * 0.001)
    perspectiveCamera.position.z = Math.max(3, Math.min(300, perspectiveCamera.position.z))
  }, { passive: false })

  // Touch events
  dom.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault()
      onPointerStart(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      e.preventDefault()
      isDragging = false

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      lastPanCenter = { x: centerX, y: centerY }

      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy)
      lastZoom = camera.position.z
    }
  }, { passive: false })

  dom.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault()
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      e.preventDefault()

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2

      const panDeltaX = centerX - lastPanCenter.x
      const panDeltaY = centerY - lastPanCenter.y

      const touchPanScale = camera.position.z * 0.0015
      cameraOffset.x -= panDeltaX * touchPanScale
      cameraOffset.y += panDeltaY * touchPanScale

      lastPanCenter = { x: centerX, y: centerY }

      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (initialPinchDistance) {
        const delta = initialPinchDistance - distance
        camera.position.z = lastZoom * (1 + delta * 0.005)
        camera.position.z = Math.max(3, Math.min(300, camera.position.z))
      }
    }
  }, { passive: false })

  dom.addEventListener('touchend', (e) => {
    e.preventDefault()
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
  const modelsToLoad = 27
  let modelsLoadedCount = 0

  function onModelLoaded() {
    modelsLoadedCount++
    if (modelsLoadedCount >= modelsToLoad) {
      modelsLoaded = true
      syncPropsToState()
      createLadder()
      emit('ready')
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
  loadModel('podest_krotki.glb', (m) => { loadedModels.podestKrotki = m })
  loadModel('podest_spoczynkowy.glb', (m) => { loadedModels.podestSpoczynkowy = m })
  loadModel('bigfoot.glb', (m) => { loadedModels.bigfoot = m })
  loadModel('prowadnica_bigfoot.glb', (m) => { loadedModels.prowadnicaBigfoot = m })
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
  const x7Count = (ladderNum === 1) ? numX7Ladders1 : numX7Ladders2
  const finalRungs = (ladderNum === 1) ? finalLadderRungs1 : finalLadderRungs2

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
  const x7Count = (ladderNum === 1) ? numX7Ladders1 : numX7Ladders2
  const finalRungs = (ladderNum === 1) ? finalLadderRungs1 : finalLadderRungs2
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
  const type = getWspornikTypeFromDistance(distanceMm)

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
function createConnector(type: string, side: string, ladderNum: number, isMidRung = false): THREE.Group {
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
    model.userData.isMidRungBracket = isMidRung

    model.traverse((child) => {
      child.userData.isConnector = true
      child.userData.connectorType = type
      child.userData.ladderNum = ladderNum
      child.userData.isMidRungBracket = isMidRung
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
  fallbackGroup.userData.connectorType = type
  fallbackGroup.userData.ladderNum = ladderNum
  fallbackGroup.userData.isMidRungBracket = isMidRung
  connectorObjects.push(fallbackGroup)
  return fallbackGroup
}

// ============================================
// CREATE WSPORNIK (wall bracket) - FIXED ROTATION
// ============================================
function createWspornik(type: string, side: string, ladderNum: number, isMidRung = false): THREE.Group | null {
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

  if (type === 'krotki' && loadedModels.wspornikKrotki) {
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

  if (type === 'dlugi' || type === 'sredni') {
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

  // Z offset - średni bliżej ściany o 50mm, długi o 100mm
  // Dla drabiny 2: odwrócona logika (dodatnie wartości)
  let baseZOffset = 0
  if (ladderNum === 1) {
    baseZOffset = (type === 'dlugi') ? -101 : ((type === 'sredni') ? -51 : 0)
  } else {
    // Drabina 2 - odwrócone
    baseZOffset = (type === 'dlugi') ? 101 : ((type === 'sredni') ? 51 : 0)
  }

  // Calculate X and Y offsets
  const extraXOffset = (type === 'dlugi') ? -3 : ((type === 'sredni') ? -4 : ((type === 'krotki') ? -1.5 : 0))
  const extraYOffset = (type === 'dlugi')
    ? (effectiveSide === 'right' ? -19.5 : -19)
    : ((type === 'sredni')
      ? (effectiveSide === 'right' ? -20 : -20)
      : 0)

  model.userData.isWspornik = true
  model.userData.wspornikType = type
  model.userData.ladderNum = ladderNum
  model.userData.isMidRungBracket = isMidRung
  model.userData.extraXOffset = extraXOffset
  model.userData.extraYOffset = extraYOffset
  model.userData.extraZOffset = baseZOffset

  model.traverse((child) => {
    child.userData.isWspornik = true
    child.userData.ladderNum = ladderNum
    child.userData.isMidRungBracket = isMidRung
  })

  addOutlineToModel(model)
  wspornikObjects.push(model)
  return model
}

// ============================================
// RENDER SAFETY CAGE (obrecze)
// ============================================
function renderSafetyCage() {
  if (!loadedModels.obrecz) return

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
      addOutlineToModel(hoop)
      ladderContainer.add(hoop)
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
      closing.userData.isSafetyCage = true
      closing.userData.ladderNum = 1
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
      closing.userData.isSafetyCage = true
      closing.userData.ladderNum = 2
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

  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)

  // === STEP 1: Get fresh positions from existing wspornikObjects ===
  for (const wsp of wspornikObjects) {
    if (wsp.userData.isWspornik && wsp.userData.ladderNum === 1 && wsp.userData.side === 'left') {
      const pairIndex = wsp.userData.pairIndex
      const type = wsp.userData.wspornikType || 'krotki'
      // Save position for this pairIndex
      savedGreenBoxPositions[pairIndex] = {
        y: wsp.position.y,
        z: wsp.position.z,
        type
      }
    }
  }

  // === STEP 2: Collect ALL pairIndex by traversing ladderContainer (like original) ===
  const allPairIndices: number[] = []
  ladderContainer.traverse((child) => {
    if (child.userData && child.userData.pairIndex !== undefined &&
        !child.userData.isGreenCollisionBox && !child.userData.isSciskaneWspornik) {
      if (!allPairIndices.includes(child.userData.pairIndex)) {
        allPairIndices.push(child.userData.pairIndex)
      }
    }
  })

  if (allPairIndices.length === 0) {
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

  for (const pairIndex of allPairIndices) {
    // Skip top handrail connector (pairIndex=0) ONLY for 'safety' handrail type
    // This is the handrail mount - not a wall bracket
    // For 'platform' and 'none' pairIndex=0 is a normal section connector
    if (handrailType === 'safety' && pairIndex === 0) {
      continue
    }

    // Get wspornik type for this pairIndex
    const wspornikType = wspornikTypes1[pairIndex] || 'krotki'
    const isLargerWspornik = wspornikType === 'sredni' || wspornikType === 'dlugi'
    const boxHeight = (boxHeightBase + (isLargerWspornik ? boxHeightExtra : 0)) * SCALE
    const yOffset = isLargerWspornik ? -20 * SCALE : 0

    // Check if we have saved position from wspornik
    const savedPos = savedGreenBoxPositions[pairIndex]

    if (savedPos) {
      // Use saved position (yOffset is already baked into savedPos.y)
      const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
      const greenBox = new THREE.Mesh(boxGeometry, greenMaterial.clone())
      greenBox.position.set(0, savedPos.y, savedPos.z)
      greenBox.userData.isGreenCollisionBox = true
      greenBox.userData.pairIndex = pairIndex
      greenBox.userData.wspornikType = wspornikType
      greenBox.userData.ladderNum = 1
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
            !conn.userData.isGreenCollisionBox && conn.userData.ladderNum === 1) {
          connY = conn.position.y
          break
        }
      }

      if (connY !== null) {
        // Calculate Z position (close to wall where wspornik would be)
        const wallThickness = 250
        const wallZ = -(globalWspornikDistance1 + (wallThickness / 2) + 33)
        const wspornikZ = (wallZ + wallThickness / 2 + 150) * SCALE

        const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
        const greenBox = new THREE.Mesh(boxGeometry, greenMaterial.clone())
        greenBox.position.set(0, connY + yOffset, wspornikZ)
        greenBox.userData.isGreenCollisionBox = true
        greenBox.userData.pairIndex = pairIndex
        greenBox.userData.wspornikType = wspornikType
        greenBox.userData.ladderNum = 1
        greenBox.visible = showDebugBboxes

        // Save calculated position for future rebuilds
        savedGreenBoxPositions[pairIndex] = {
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
      const customDistance = handle.wspornikDistance || wspornikDefaultDistances[handle.wspornikType]
      const defaultDist = wspornikDefaultDistances[handle.wspornikType]
      const distanceOffset = customDistance - defaultDist
      const distanceZOffset = -distanceOffset

      const leftWsp = createWspornik(handle.wspornikType, 'left', 1, false)
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

      const rightWsp = createWspornik(handle.wspornikType, 'right', 1, false)
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

  // Render for ladder 2 (attic mode)
  if (handrailType === 'attic') {
    for (const handle of sciskaneHandles2) {
      const yPos = (maxHeight / 2) - (height2 - handle.offsetFromBottom)
      const geoConfig = ladderGeometryConfig[2]
      const connType = handle.connType || 'sciskany'

      const leftConn = createConnector(connType, 'left', 2, false)
      leftConn.position.x = (-RAIL_OFFSET + 15 - 15) * SCALE
      leftConn.position.y = yPos * SCALE
      leftConn.position.z = (geoConfig.sciskane.leftZOffset + geoConfig.zOffset) * SCALE
      leftConn.userData.isSciskaneHandle = true
      leftConn.userData.isSciskanePlaced = true
      leftConn.userData.offsetFromBottom = handle.offsetFromBottom
      leftConn.userData.ladderNum = 2
      ladderContainer.add(leftConn)
      sciskanePlacedObjects.push(leftConn)

      const rightConn = createConnector(connType, 'right', 2, false)
      rightConn.position.x = (RAIL_OFFSET - 15 + 15) * SCALE
      rightConn.position.y = yPos * SCALE
      rightConn.position.z = (geoConfig.sciskane.rightZOffset + geoConfig.zOffset) * SCALE
      rightConn.userData.isSciskaneHandle = true
      rightConn.userData.isSciskanePlaced = true
      rightConn.userData.offsetFromBottom = handle.offsetFromBottom
      rightConn.userData.ladderNum = 2
      ladderContainer.add(rightConn)
      sciskanePlacedObjects.push(rightConn)
    }
  }
}

// ============================================
// MAIN CREATE LADDER FUNCTION
// ============================================
function createLadder() {
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

  // Determine which ladders to render
  const laddersToRender = [1]
  if (handrailType === 'attic') {
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

        addOutlineToModel(model)
        ladderContainer.add(model)
      }

      currentHeightOffset += sectionHeight
      if (s < ladderSections.length - 1) {
        currentHeightOffset += 3  // 3mm gap
      }
    }
  }

  // Add handrails or attic passage
  if (handrailType === 'safety' && totalHeight > 0) {
    renderSafetyHandrails(totalHeight)
  } else if (handrailType === 'platform' && totalHeight > 0) {
    renderPlatformHandrails(totalHeight)
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

  // Render wall and ground
  if (height1 > 0 && wallHeightConfig > 0) {
    renderWallAndGround(height1, maxHeight)
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
    leftPorecz.position.z = -245.5 * SCALE
    addOutlineToModel(leftPorecz)
    ladderContainer.add(leftPorecz)

    // Right handrail
    const rightPorecz = loadedModels.porecz.clone(true)
    rightPorecz.scale.set(SCALE, SCALE, SCALE)
    rightPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    rightPorecz.position.x = RAIL_OFFSET * SCALE
    rightPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    rightPorecz.position.z = -245.5 * SCALE
    addOutlineToModel(rightPorecz)
    ladderContainer.add(rightPorecz)
  }
}

// ============================================
// RENDER PLATFORM HANDRAILS
// ============================================
function renderPlatformHandrails(totalHeight: number) {
  const topOfLadder = totalHeight / 2

  // Same handrails as safety
  if (loadedModels.porecz) {
    const leftPorecz = loadedModels.porecz.clone(true)
    leftPorecz.scale.set(SCALE, SCALE, SCALE)
    leftPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    leftPorecz.position.x = -RAIL_OFFSET * SCALE
    leftPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    leftPorecz.position.z = -245.5 * SCALE
    addOutlineToModel(leftPorecz)
    ladderContainer.add(leftPorecz)

    const rightPorecz = loadedModels.porecz.clone(true)
    rightPorecz.scale.set(SCALE, SCALE, SCALE)
    rightPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
    rightPorecz.position.x = RAIL_OFFSET * SCALE
    rightPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
    rightPorecz.position.z = -245.5 * SCALE
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
    podest.position.z = -245.5 * SCALE
    addOutlineToModel(podest)
    ladderContainer.add(podest)
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
    attyka.position.z = -535 * SCALE
    attyka.userData.ladderNum = 0
    addOutlineToModel(attyka)
    ladderContainer.add(attyka)
  }

  if (loadedModels.krataWema) {
    const krata = loadedModels.krataWema.clone(true)
    krata.scale.set(SCALE, SCALE, SCALE)
    krata.rotation.set(Math.PI * 1.5, 0, 0)
    krata.position.x = 0
    krata.position.y = (topOfMainRails + DIMS.atticRailHeight / 2 - 430) * SCALE
    krata.position.z = -535 * SCALE
    krata.userData.ladderNum = 0
    addOutlineToModel(krata)
    ladderContainer.add(krata)
  }

  // BIGFOOT - renderuj gdy typ montażu zejścia to bigfoot
  if (props.descentMountType === 'bigfoot') {
    // Stała pozycja Z (bigfoot nie przesuwa się z drabiną)
    // Oryginalna formuła: -(215 + 250 + 33 + 250 + 1000 - 678) = -1070
    const bigfootZ = -1070
    
    // Oblicz pozycję na szczycie ściany zejścia (dachu)
    const atticDist = props.atticPlatformDistance ?? 0
    const topOffset = -161 + 511 - atticDist
    const ladderTop = totalHeight / 2
    const groundLevel = ladderTop - wallHeightConfig + topOffset
    const groundThickness = 50
    
    // Wysokość ściany zejścia = główna ściana - atticWallHeight
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
      prowadnica.userData.isBigfoot = true
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
    // Stała pozycja Z (tak samo jak bigfoot)
    const customBaseZ = -1070

    // Oblicz pozycję dachu (szczyt ściany zejścia)
    const atticDist = props.atticPlatformDistance ?? 0
    const topOffset = -161 + 511 - atticDist
    const ladderTop = totalHeight / 2
    const groundLevel = ladderTop - wallHeightConfig + topOffset
    const groundThickness = 50
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
  const wallThickness = 250
  const wallZ = -(globalWspornikDistance1 + wallThickness / 2 + 33)
  const descentLadderZ = wallZ - wallThickness - 447  // 10cm + 347mm za ścianą zejścia
  
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
    addOutlineToModel(endLadder)
    ladderContainer.add(endLadder)
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

  // Top connector (for safety or attic handrails)
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
    const groundDepth = 3000
    const wallThickness = 250
    const groundGeometry = new THREE.BoxGeometry(wallWidthConfig * SCALE, 50 * SCALE, groundDepth * SCALE)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8c00,
      roughness: 0.7,
      metalness: 0.1
    })
    const groundBar = new THREE.Mesh(groundGeometry, groundMaterial)

    const backOfWall = -(globalWspornikDistance1 + wallThickness + 25)
    const groundZ = backOfWall + groundDepth / 2
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
    if (handrailType === 'attic' && props.atticWallHeight !== undefined) {
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

        // Ocieplenie po drugiej stronie ściany (strona zejścia)
        // Wysokość = wysokość ściany strona zejścia (od góry ściany w dół)
        if (props.atticBackHasInsulation && props.atticBackInsulationThickness) {
          const backInsulationThickness = props.atticBackInsulationThickness
          const backInsulationHeight = props.atticWallHeight  // wysokość ściany zejścia
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

    // Distance from last hoop bottom to ground (+ suspendedHeight if ladder is suspended)
    lastHoopToGround = Math.round(lastHoopY - groundLevel + suspendedHeight1)
  }

  emit('update', {
    totalRungs,
    totalHeightMm,
    safetyCageCount: safetyCageCount1,
    connectorTypes: connectorTypes1.slice(),
    wspornikTypes: wspornikTypes1.slice(),
    lastRungToGround: Math.round(lastRungToGround),
    lastHoopToGround
  })
}

// ============================================
// ANIMATION (custom camera control)
// ============================================
function animate() {
  if (isDisposed) return

  requestAnimationFrame(animate)

  // In tech drawing mode, don't modify camera/rotation
  if (!isTechDrawingMode) {
    // Smooth rotation interpolation
    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.1
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.1

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

  renderer.render(scene, camera)
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

    // Sprawdź flagi debug w hierarchii
    let isDebug = false
    let checkObj: THREE.Object3D | null = obj
    while (checkObj) {
      if (checkObj.userData.isGreenCollisionBox ||
          checkObj.userData.isCollisionZone ||
          checkObj.userData.isMidRungBox ||
          checkObj.userData.isSciskaneBox ||
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

  // Calculate model height for camera fitting
  const height1 = getTotalHeightForLadder(1)
  let totalHeight = height1
  let totalHeightWithHandrails = totalHeight

  if (handrailType === 'safety' || handrailType === 'platform') {
    totalHeightWithHandrails += DIMS.handrailVertical
  } else if (handrailType === 'attic') {
    totalHeightWithHandrails += DIMS.atticRailHeight
  }

  // Ortho camera size with margin
  const modelHeight = totalHeightWithHandrails * SCALE
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

  // Center of model
  const centerY = modelHeight / 2
  const extraOffset = (handrailType === 'none') ? 0.10 : 0.01
  const offsetY = modelHeight * (0.385 + extraOffset)
  const lookAtY = centerY - offsetY

  // Set camera position for view
  if (view === 'front') {
    orthoCamera.position.set(0, lookAtY, 50)
    orthoCamera.lookAt(0, lookAtY, 0)
    orthoCamera.up.set(0, 1, 0)
  } else if (view === 'side') {
    orthoCamera.position.set(50, lookAtY, 0)
    orthoCamera.lookAt(0, lookAtY, 0)
    orthoCamera.up.set(0, 1, 0)
  } else if (view === 'back') {
    orthoCamera.position.set(0, lookAtY, -50)
    orthoCamera.lookAt(0, lookAtY, 0)
    orthoCamera.up.set(0, 1, 0)
  } else if (view === 'top') {
    orthoCamera.position.set(0, 50, 0)
    orthoCamera.lookAt(0, 0, 0)
    orthoCamera.up.set(0, 0, -1)
  }

  // Switch to orthographic camera
  camera = orthoCamera

  // Emit event
  emit('techDrawingChange', {
    enabled: true,
    view,
    totalHeightMm: Math.round(totalHeightWithHandrails)
  })
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

  // Restore all ladder visibility
  ladderContainer.traverse((child) => {
    child.visible = true
  })

  // Switch back to perspective camera
  camera = perspectiveCamera

  emit('techDrawingChange', {
    enabled: false,
    view: techDrawingView,
    totalHeightMm: 0
  })
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

  // Rebuild ladder to show/hide collision boxes
  createLadder()
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
  const newType = getWspornikTypeForDistance(distanceMm)

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
}

function createSciskanePreview() {
  clearSciskanePreview()

  // Use sciskany model, fallback to uchwyt
  const sourceModel = loadedModels.sciskany || loadedModels.uchwyt
  if (!sourceModel) return

  const height1 = getTotalHeightForLadder(1)
  const maxHeight = height1
  const sections = getLadderSectionsForLadder(1)

  if (sections.length === 0) return

  // Preview material - green transparent
  const previewMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    metalness: 0.5,
    roughness: 0.5,
    transparent: true,
    opacity: 0.4
  })

  const railOffset = 265
  const geoConfig = ladderGeometryConfig[1]
  let currentOffset = 0

  for (let s = 0; s < sections.length; s++) {
    const section = sections[s]
    const sectionHeight = getLadderHeight(section.rungs)

    // Create preview for each space between rungs
    for (let i = 0; i < section.rungs - 1; i++) {
      const yPos = (maxHeight / 2) - currentOffset - DIMS.firstRungFromTop - (i * DIMS.rungSpacing) - DIMS.rungSpacing / 2

      // Check if position is valid (not too close to existing connectors)
      if (!isPositionValidForSciskane(yPos)) continue

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
      leftPreview.userData.ladderNum = 1
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
      rightPreview.userData.ladderNum = 1
      ladderContainer.add(rightPreview)
      sciskanePreviewObjects.push(rightPreview)
    }

    currentOffset += sectionHeight
    if (s < sections.length - 1) {
      currentOffset += 3 // 3mm gap between sections
    }
  }
}

function isPositionValidForSciskane(yPos: number, ladderNum: number = 1): boolean {
  const ladderTotalHeight = getTotalHeightForLadder(ladderNum)
  const height1 = getTotalHeightForLadder(1)
  const height2 = getTotalHeightForLadder(2)
  const maxHeight = Math.max(height1, height2)
  const minDistance = 150 // 15cm minimum distance from connectors

  // Check distance from connectors (use calculated positions)
  const connectorPositions = getConnectorPositions()
  for (const connY of connectorPositions) {
    if (Math.abs(yPos - connY) < minDistance) {
      return false
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

  // Add new handle
  handles.push({
    offsetFromBottom,
    connType: 'sciskany',
    wspornikType: 'krotki',
    wspornikDistance: 215,
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
    if (updates.wspornikType !== undefined) handle.wspornikType = updates.wspornikType
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
// PUBLIC METHODS (exposed to parent)
// ============================================
defineExpose({
  createLadder,
  resetCamera: () => {
    targetRotation = { x: 0, y: 0.3 }
    currentRotation = { x: 0, y: 0.3 }
    cameraOffset = { x: 0, y: 0, z: 0 }
    if (perspectiveCamera) perspectiveCamera.position.z = 50
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
  updateSciskaneHandle,
  removeSciskaneHandle,
  updateJointConnector,
  updateMidRungBracket,
  removeMidRungBracket,
  getMidRungBracketState,
  setDebugMode,
  emitDebugInfo,
  isDebugMode: () => debugMode,
  setGlobalWspornikDistance,
  getGlobalWspornikDistance,
  getWspornikTypeForDistance,
  setWallWidth,
  getWallWidth
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
}
</style>
