import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  COLORS,
  CAMERA_SETTINGS,
  LIGHT_SETTINGS
} from './constants'
import type { LadderConfig, ThreeDState } from '@/types'

// ============================================
// STAŁE Z ORYGINALNEGO drabiny_3d
// ============================================

// Wymiary w mm (dokładne wartości z modeli Fusion360)
const DIMS = {
  rungWidth: 30,
  rungHeight: 30,
  rungLength: 500,
  railWidth: 50,
  railDepth: 30,
  firstRungFromTop: 130,  // 130mm od góry do pierwszego szczebla
  rungSpacing: 275,       // Odstęp między szczeblami
  handrailVertical: 1011, // Wysokość poręczy asekuracyjnej
  handrailHorizontal: 540,
  handrailWidth: 30,
  connectorHeight: 145,   // Wysokość łącznika/uchwytu
  atticRailHeight: 1100,  // Wysokość attyki
  // Wysokości drabin dla różnej ilości szczebli
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

// Przelicznik mm na jednostki Three.js (1 jednostka = 100mm)
const SCALE = 0.01

// Konfiguracja geometrii dla drabiny 1 (przednia)
const LADDER_GEOMETRY_CONFIG = {
  zOffset: 0,
  rotationZ: 0,
  connector: {
    left: { x: Math.PI * 0.5, y: Math.PI, z: 0 },
    right: { x: Math.PI * 0.5, y: 0, z: 0 },
    zOffset: 0,
    uchwytZOffset: 0
  },
  wspornik: {
    left: { x: 0, y: 0, z: 0 },
    right: { x: 0, y: Math.PI, z: 0 },
    zOffset: -150
  }
}

// Offset szyny od środka drabiny
const RAIL_OFFSET = 265 // 265mm

/**
 * Główna klasa sceny Three.js dla konfiguratora drabin
 * Z pełną logiką pozycjonowania z oryginalnego drabiny_3d
 */
export class ThreeScene {
  private container: HTMLElement
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private loader: GLTFLoader

  // Grupy obiektów
  private ladderContainer: THREE.Group
  private wallGroup: THREE.Group

  // Załadowane modele
  private loadedModels: {
    powielana: THREE.Group | null
    koncowa: Record<number, THREE.Group | null>
    porecz: THREE.Group | null
    obrecz: THREE.Group | null
    uchwyt: THREE.Group | null
    lacznik: THREE.Group | null
  } = {
    powielana: null,
    koncowa: {},
    porecz: null,
    obrecz: null,
    uchwyt: null,
    lacznik: null
  }

  // Tekstury i materiały
  private galvanizedTexture: THREE.Texture | null = null
  private modelMaterial: THREE.MeshStandardMaterial | null = null

  // Stan
  private isDisposed = false
  private modelsLoaded = false
  private pendingConfig: { config: LadderConfig; state: ThreeDState } | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.loader = new GLTFLoader()

    // Inicjalizacja sceny
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(COLORS.SKY_BLUE)

    // Kamera
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_SETTINGS.FOV,
      aspect,
      CAMERA_SETTINGS.NEAR,
      CAMERA_SETTINGS.FAR
    )
    this.camera.position.set(
      CAMERA_SETTINGS.DEFAULT_POSITION.x,
      CAMERA_SETTINGS.DEFAULT_POSITION.y,
      CAMERA_SETTINGS.DEFAULT_POSITION.z
    )

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    // Kontrolki orbity
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.target.set(0, 2.5, 0)

    // Główny kontener drabiny (jak w oryginale)
    this.ladderContainer = new THREE.Group()
    this.wallGroup = new THREE.Group()
    this.scene.add(this.ladderContainer)
    this.scene.add(this.wallGroup)

    // Inicjalizacja
    this.setupLights()
    this.setupGround()

    // Załaduj tekstury i modele
    this.loadTextures()
    this.loadAllModels()

    // Resize handler
    window.addEventListener('resize', this.handleResize)

    // Start animacji
    this.animate()
  }

  /**
   * Załaduj tekstury
   */
  private loadTextures(): void {
    const textureLoader = new THREE.TextureLoader()
    const textureRepeat = 0.008

    this.galvanizedTexture = textureLoader.load('/models/textures/ocynk.png')
    this.galvanizedTexture.wrapS = THREE.RepeatWrapping
    this.galvanizedTexture.wrapT = THREE.RepeatWrapping
    this.galvanizedTexture.repeat.set(textureRepeat, textureRepeat)

    // Materiał dla modeli (jak w oryginale)
    this.modelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(230/255, 235/255, 240/255),
      map: this.galvanizedTexture,
      metalness: 0.4,
      roughness: 0.5
    })
  }

  /**
   * Załaduj wszystkie modele GLB
   */
  private loadAllModels(): void {
    let modelsToLoad = 12 // powielana + 7 końcowych + porecz + obrecz + uchwyt + lacznik
    let loadedCount = 0

    const onModelLoaded = () => {
      loadedCount++
      console.log(`[ThreeScene] Model loaded: ${loadedCount}/${modelsToLoad}`)
      if (loadedCount === modelsToLoad) {
        this.modelsLoaded = true
        console.log('[ThreeScene] Wszystkie modele załadowane')

        if (this.pendingConfig) {
          console.log('[ThreeScene] Rendering pending config:', this.pendingConfig.state)
          this.renderLadder(this.pendingConfig.config, this.pendingConfig.state)
          this.pendingConfig = null
        } else {
          console.log('[ThreeScene] No pending config to render')
        }
      }
    }

    // Ładuj drabinapowielana.glb (X7)
    this.loader.load('/models/drabinapowielana.glb', (gltf) => {
      this.loadedModels.powielana = this.prepareModel(gltf.scene)
      console.log('[ThreeScene] Załadowano drabinapowielana.glb')
      onModelLoaded()
    }, undefined, (error) => {
      console.error('Błąd ładowania drabinapowielana.glb:', error)
      onModelLoaded()
    })

    // Ładuj koncowa-x1.glb do koncowa-x7.glb
    for (let i = 1; i <= 7; i++) {
      ((index) => {
        this.loader.load(`/models/koncowa-x${index}.glb`, (gltf) => {
          this.loadedModels.koncowa[index] = this.prepareModel(gltf.scene)
          onModelLoaded()
        }, undefined, (error) => {
          console.error(`Błąd ładowania koncowa-x${index}.glb:`, error)
          onModelLoaded()
        })
      })(i)
    }

    // Ładuj porecz.glb
    this.loader.load('/models/porecz.glb', (gltf) => {
      this.loadedModels.porecz = this.prepareModel(gltf.scene)
      onModelLoaded()
    }, undefined, (error) => {
      console.error('Błąd ładowania porecz.glb:', error)
      onModelLoaded()
    })

    // Ładuj obrecz.glb (kosz ochronny)
    this.loader.load('/models/obrecz.glb', (gltf) => {
      this.loadedModels.obrecz = this.prepareModel(gltf.scene)
      onModelLoaded()
    }, undefined, (error) => {
      console.error('Błąd ładowania obrecz.glb:', error)
      onModelLoaded()
    })

    // Ładuj bryla400.glb (uchwyt łączący sekcje)
    this.loader.load('/models/bryla400.glb', (gltf) => {
      this.loadedModels.uchwyt = this.prepareModel(gltf.scene)
      console.log('[ThreeScene] Załadowano bryla400.glb jako uchwyt')
      onModelLoaded()
    }, undefined, (error) => {
      console.error('Błąd ładowania bryla400.glb:', error)
      onModelLoaded()
    })

    // Ładuj lacznik.glb
    this.loader.load('/models/lacznik.glb', (gltf) => {
      this.loadedModels.lacznik = this.prepareModel(gltf.scene)
      onModelLoaded()
    }, undefined, (error) => {
      console.error('Błąd ładowania lacznik.glb:', error)
      onModelLoaded()
    })
  }

  /**
   * Przygotuj model - zastosuj materiał i wycentruj
   */
  private prepareModel(gltfScene: THREE.Group): THREE.Group {
    const obj = gltfScene.clone()

    // Zastosuj materiał i cienie
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = this.modelMaterial!.clone()
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    return obj
  }

  /**
   * Klonuj model z materiałem
   */
  private cloneModel(model: THREE.Group | null): THREE.Group | null {
    if (!model) return null

    const clone = model.clone(true)
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = this.modelMaterial!.clone()
      }
    })

    return clone
  }

  /**
   * Ustaw oświetlenie
   */
  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(
      LIGHT_SETTINGS.AMBIENT_COLOR,
      LIGHT_SETTINGS.AMBIENT_INTENSITY
    )
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(
      LIGHT_SETTINGS.DIRECTIONAL_COLOR,
      LIGHT_SETTINGS.DIRECTIONAL_INTENSITY
    )
    directionalLight.position.set(
      LIGHT_SETTINGS.DIRECTIONAL_POSITION.x,
      LIGHT_SETTINGS.DIRECTIONAL_POSITION.y,
      LIGHT_SETTINGS.DIRECTIONAL_POSITION.z
    )
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    this.scene.add(directionalLight)
  }

  /**
   * Ustaw podłoże
   */
  private setupGround(): void {
    const groundGeometry = new THREE.PlaneGeometry(20, 20)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.GROUND_GREEN,
      roughness: 0.8
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const gridHelper = new THREE.GridHelper(20, 20, COLORS.GRID_GRAY, COLORS.GRID_GRAY)
    gridHelper.position.y = 0.01
    this.scene.add(gridHelper)
  }

  /**
   * Ustaw ścianę (wizualizacja)
   */
  private setupWall(wallHeightMm: number, wspornikDistance: number = 215): void {
    this.wallGroup.clear()

    if (wallHeightMm <= 0) return

    const wallThickness = 250 // mm
    const wallGeometry = new THREE.BoxGeometry(
      3000 * SCALE,
      wallHeightMm * SCALE,
      wallThickness * SCALE
    )
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4b0,
      roughness: 0.9,
      metalness: 0.0
    })
    const wall = new THREE.Mesh(wallGeometry, wallMaterial)

    // Pozycja ściany - za wspornikami
    const wallZ = -(wspornikDistance + wallThickness / 2 + 39)
    wall.position.set(0, (wallHeightMm / 2) * SCALE, wallZ * SCALE)
    wall.receiveShadow = true

    this.wallGroup.add(wall)
  }

  /**
   * Oblicz całkowitą wysokość drabiny w mm
   */
  private getTotalHeight(numX7: number, finalRungs: number): number {
    let total = numX7 * DIMS.railHeights[7]
    const sectionCount = numX7 + (finalRungs > 0 ? 1 : 0)

    if (finalRungs > 0 && finalRungs <= 7) {
      total += DIMS.railHeights[finalRungs]
    }

    // Dodaj 3mm odstępy między sekcjami
    if (sectionCount > 1) {
      total += (sectionCount - 1) * 3
    }

    return total
  }

  /**
   * Główna funkcja renderowania drabiny
   */
  renderLadder(config: LadderConfig, state: ThreeDState): void {
    console.log('[ThreeScene] renderLadder called:', {
      modelsLoaded: this.modelsLoaded,
      numX7: state.numX7Ladders,
      finalRungs: state.finalLadderRungs,
      wallHeight: config.wallHeight,
      scheme: config.scheme
    })

    if (!this.modelsLoaded) {
      console.log('[ThreeScene] Models not loaded yet, queuing render')
      this.pendingConfig = { config, state }
      return
    }

    // Wyczyść poprzednią drabinę
    while (this.ladderContainer.children.length > 0) {
      this.ladderContainer.remove(this.ladderContainer.children[0])
    }

    const totalHeight = this.getTotalHeight(state.numX7Ladders, state.finalLadderRungs)
    const geoConfig = LADDER_GEOMETRY_CONFIG

    // ============================================
    // 1. RENDERUJ MODUŁY DRABINY
    // ============================================
    let currentHeightOffset = 0

    // Moduły X7 (powielana)
    console.log('[ThreeScene] Rendering', state.numX7Ladders, 'X7 modules, totalHeight:', totalHeight)
    console.log('[ThreeScene] loadedModels.powielana:', this.loadedModels.powielana ? 'loaded' : 'not loaded')

    for (let i = 0; i < state.numX7Ladders; i++) {
      const sectionHeight = DIMS.railHeights[7]
      const model = this.cloneModel(this.loadedModels.powielana)

      // Pozycja Y - wyrównane do góry
      const yPos = (totalHeight / 2) - currentHeightOffset - (sectionHeight / 2)

      if (model) {
        // Rotacja o 270 stopni (model z Fusion360)
        model.rotation.x = Math.PI * 1.5
        model.rotation.z = geoConfig.rotationZ
        model.scale.set(SCALE, SCALE, SCALE)

        model.position.y = yPos * SCALE
        model.position.z = geoConfig.zOffset * SCALE

        this.ladderContainer.add(model)
        console.log('[ThreeScene] Added X7 module at Y:', model.position.y)
      } else {
        // Fallback: dodaj prosty box dla debugowania
        console.warn('[ThreeScene] No powielana model loaded! Adding debug box.')
        const boxGeometry = new THREE.BoxGeometry(0.4, sectionHeight * SCALE, 0.1)
        const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 })
        const box = new THREE.Mesh(boxGeometry, boxMaterial)
        box.position.y = yPos * SCALE
        box.position.z = geoConfig.zOffset * SCALE
        this.ladderContainer.add(box)
      }

      currentHeightOffset += sectionHeight
      if (i < state.numX7Ladders - 1 || state.finalLadderRungs > 0) {
        currentHeightOffset += 3 // 3mm gap
      }
    }

    // Moduł końcowy
    if (state.finalLadderRungs > 0 && state.finalLadderRungs <= 7) {
      const sectionHeight = DIMS.railHeights[state.finalLadderRungs]
      const model = this.cloneModel(this.loadedModels.koncowa[state.finalLadderRungs])

      if (model) {
        model.rotation.x = Math.PI * 1.5
        model.rotation.z = geoConfig.rotationZ
        model.scale.set(SCALE, SCALE, SCALE)

        const yPos = (totalHeight / 2) - currentHeightOffset - (sectionHeight / 2)
        model.position.y = yPos * SCALE
        model.position.z = geoConfig.zOffset * SCALE

        this.ladderContainer.add(model)
      }
    }

    // ============================================
    // 2. RENDERUJ ZAKOŃCZENIE (PORĘCZE LUB PODEST)
    // ============================================
    const topOfLadder = totalHeight / 2 // mm

    if (config.scheme === 'no-platform' || config.scheme === 'with-platform') {
      // Poręcze asekuracyjne
      if (this.loadedModels.porecz) {
        // Lewa poręcz
        const leftPorecz = this.cloneModel(this.loadedModels.porecz)
        if (leftPorecz) {
          leftPorecz.scale.set(SCALE, SCALE, SCALE)
          leftPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
          leftPorecz.position.x = -RAIL_OFFSET * SCALE
          leftPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
          leftPorecz.position.z = -245.5 * SCALE
          this.ladderContainer.add(leftPorecz)
        }

        // Prawa poręcz
        const rightPorecz = this.cloneModel(this.loadedModels.porecz)
        if (rightPorecz) {
          rightPorecz.scale.set(SCALE, SCALE, SCALE)
          rightPorecz.rotation.set(Math.PI * 1.5, 0, Math.PI)
          rightPorecz.position.x = RAIL_OFFSET * SCALE
          rightPorecz.position.y = (topOfLadder + DIMS.handrailVertical / 2) * SCALE
          rightPorecz.position.z = -245.5 * SCALE
          this.ladderContainer.add(rightPorecz)
        }
      }
    }

    // ============================================
    // 3. RENDERUJ ŁĄCZNIKI/UCHWYTY
    // ============================================
    this.renderConnectors(state, totalHeight)

    // ============================================
    // 4. RENDERUJ KOSZ BEZPIECZEŃSTWA
    // ============================================
    if (state.safetyCageCount > 0) {
      this.renderSafetyCage(state.safetyCageCount, totalHeight, config.scheme)
    }

    // ============================================
    // 5. ŚCIANA I POZYCJONOWANIE
    // ============================================
    const wallHeightMm = config.wallHeight * 1000
    this.setupWall(wallHeightMm)

    // Pozycja kontenera - góra drabiny na wysokości ściany
    // Korekta zależy od typu zakończenia
    const topOffset = (config.scheme === 'with-platform') ? -211 : -161
    const ladderTop = totalHeight / 2
    const groundLevel = ladderTop - wallHeightMm + topOffset

    // Podłoga (pozycja Y względem drabiny)
    this.ladderContainer.position.y = -groundLevel * SCALE

    // Wycentruj kamerę
    this.centerCamera(config.wallHeight)
  }

  /**
   * Renderuj łączniki między sekcjami
   */
  private renderConnectors(state: ThreeDState, totalHeight: number): void {
    const geoConfig = LADDER_GEOMETRY_CONFIG
    const numSections = state.numX7Ladders + (state.finalLadderRungs > 0 ? 1 : 0)

    // Łączniki na górze (dla poręczy asekuracyjnych)
    if (numSections > 0 && this.loadedModels.uchwyt) {
      const topY = (totalHeight / 2) - (DIMS.connectorHeight / 2) - 50 + 100 // +100 dla poręczy
      const connectorZ = -62.5

      // Lewy uchwyt
      const leftConn = this.cloneModel(this.loadedModels.uchwyt)
      if (leftConn) {
        leftConn.scale.set(SCALE, SCALE, SCALE)
        const rot = geoConfig.connector.left
        leftConn.rotation.set(rot.x, rot.y, rot.z)
        leftConn.position.x = (-RAIL_OFFSET) * SCALE
        leftConn.position.y = topY * SCALE
        leftConn.position.z = (connectorZ + geoConfig.zOffset) * SCALE
        this.ladderContainer.add(leftConn)
      }

      // Prawy uchwyt
      const rightConn = this.cloneModel(this.loadedModels.uchwyt)
      if (rightConn) {
        rightConn.scale.set(SCALE, SCALE, SCALE)
        const rot = geoConfig.connector.right
        rightConn.rotation.set(rot.x, rot.y, rot.z)
        rightConn.position.x = (RAIL_OFFSET) * SCALE
        rightConn.position.y = topY * SCALE
        rightConn.position.z = (connectorZ + geoConfig.zOffset) * SCALE
        this.ladderContainer.add(rightConn)
      }
    }

    // Łączniki między sekcjami
    if (numSections > 1) {
      let currentOffset = DIMS.railHeights[7]
      const SECTION_GAP = 3

      for (let i = 0; i < state.numX7Ladders - 1 + (state.finalLadderRungs > 0 ? 1 : 0); i++) {
        const gapCenterOffset = SECTION_GAP / 2
        const connectionY = (totalHeight / 2) - currentOffset - gapCenterOffset + (DIMS.connectorHeight / 2) - 50
        const connectorZ = -62.5

        // Lewy uchwyt
        const leftConn = this.cloneModel(this.loadedModels.uchwyt)
        if (leftConn) {
          leftConn.scale.set(SCALE, SCALE, SCALE)
          const rot = geoConfig.connector.left
          leftConn.rotation.set(rot.x, rot.y, rot.z)
          leftConn.position.x = (-RAIL_OFFSET) * SCALE
          leftConn.position.y = connectionY * SCALE
          leftConn.position.z = (connectorZ + geoConfig.zOffset) * SCALE
          this.ladderContainer.add(leftConn)
        }

        // Prawy uchwyt
        const rightConn = this.cloneModel(this.loadedModels.uchwyt)
        if (rightConn) {
          rightConn.scale.set(SCALE, SCALE, SCALE)
          const rot = geoConfig.connector.right
          rightConn.rotation.set(rot.x, rot.y, rot.z)
          rightConn.position.x = (RAIL_OFFSET) * SCALE
          rightConn.position.y = connectionY * SCALE
          rightConn.position.z = (connectorZ + geoConfig.zOffset) * SCALE
          this.ladderContainer.add(rightConn)
        }

        // Przejdź do następnej sekcji
        if (i < state.numX7Ladders - 1) {
          currentOffset += DIMS.railHeights[7] + SECTION_GAP
        } else if (state.finalLadderRungs > 0) {
          currentOffset += DIMS.railHeights[state.finalLadderRungs] + SECTION_GAP
        }
      }
    }
  }

  /**
   * Renderuj kosz bezpieczeństwa
   */
  private renderSafetyCage(hoopCount: number, totalHeight: number, scheme: string): void {
    if (!this.loadedModels.obrecz) return

    const hoopSpacing = 641.7 // mm
    const geoConfig = LADDER_GEOMETRY_CONFIG

    // Pozycja startowa (góra poręczy)
    let topPosition = totalHeight / 2
    let firstHoopOffset: number

    if (scheme === 'no-platform' || scheme === 'with-platform') {
      topPosition += DIMS.handrailVertical
      firstHoopOffset = 25
    } else {
      firstHoopOffset = 294.3
    }

    for (let i = 0; i < hoopCount; i++) {
      const yPos = topPosition - firstHoopOffset - (i * hoopSpacing)

      const hoop = this.cloneModel(this.loadedModels.obrecz)
      if (hoop) {
        hoop.scale.set(SCALE, SCALE, SCALE)
        hoop.rotation.x = Math.PI * 0.5
        hoop.rotation.z = geoConfig.rotationZ
        hoop.position.x = 0
        hoop.position.y = yPos * SCALE
        hoop.position.z = (geoConfig.zOffset + 241) * SCALE

        this.ladderContainer.add(hoop)
      }
    }
  }

  /**
   * Wycentruj kamerę na drabinie
   */
  private centerCamera(wallHeightM: number): void {
    const targetY = wallHeightM / 2
    this.controls.target.set(0, targetY, 0)

    const distance = Math.max(5, wallHeightM * 0.8)
    this.camera.position.set(distance, targetY + 2, distance)
    this.controls.update()
  }

  /**
   * Aktualizuj kosz
   */
  updateCage(_count: number): void {
    // Kosz jest renderowany w ramach renderLadder
    // Ta metoda może być użyta do aktualizacji bez pełnego przerenderowania
  }

  /**
   * Obsługa zmiany rozmiaru
   */
  private handleResize = (): void => {
    if (this.isDisposed) return

    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  /**
   * Pętla animacji
   */
  private animate = (): void => {
    if (this.isDisposed) return

    requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Resetuj widok kamery
   */
  resetCamera(): void {
    this.camera.position.set(
      CAMERA_SETTINGS.DEFAULT_POSITION.x,
      CAMERA_SETTINGS.DEFAULT_POSITION.y,
      CAMERA_SETTINGS.DEFAULT_POSITION.z
    )
    this.controls.target.set(0, 2.5, 0)
    this.controls.update()
  }

  /**
   * Zwolnij zasoby
   */
  dispose(): void {
    this.isDisposed = true
    window.removeEventListener('resize', this.handleResize)

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }

    this.renderer.dispose()
    this.controls.dispose()

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })

    if (this.galvanizedTexture) {
      this.galvanizedTexture.dispose()
    }
  }
}
