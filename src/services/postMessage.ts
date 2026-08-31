/**
 * PostMessage Service for Seller Embed Mode
 * Handles communication between iframe and parent window
 */

export interface LadderConfig {
  // Basic
  purpose?: 'external' | 'internal'
  scheme?: 'no-platform' | 'with-platform' | 'attic-passage'
  wallHeight?: number

  // Cage
  cage?: 'no-cage' | 'with-cage'
  cageClosing?: boolean

  // Brackets
  bracketType?: 'short' | 'medium' | 'long' | 'custom' | null
  bracketTypeManual?: boolean  // Czy użytkownik ręcznie wybrał wspornik wejścia
  bracketSpacing?: number
  bracketCustom?: number | null  // Custom bracket distance in cm (when bracketType='custom')
  insulationThickness?: number

  // Suspension
  suspended?: boolean
  suspendedHeight?: number

  // Eave
  hasEave?: boolean
  eaveDepth?: number
  eaveHeight?: number

  // Attic passage
  atticWallHeight?: number
  atticWallThickness?: number
  atticInsulationThickness?: number
  atticBackInsulationThickness?: number
  atticMinDistance?: number  // Dystans podest-attyka w cm
  descentMountType?: 'standard' | 'bigfoot' | 'custom-base' | 'brackets' | 'self'
  descentBracketType?: 'short' | 'medium' | 'long'
  descentBracketTypeManual?: boolean  // Czy użytkownik ręcznie wybrał wspornik zejścia
  descentBracketSpacing?: number  // Odległość wsporników strony zejścia (mm)
  customBaseHeight?: number  // Wysokość własnego podłoża w cm (0 dla "brak")

  // Options
  restingPlatform?: boolean
  portableLadder?: boolean
  accessLock?: boolean
  hasHandrails?: boolean  // +1.1m safety handrails (only for no-platform)

  // Obstacles
  hasObstacles?: boolean
  obstacles?: Array<{
    id: number
    type: string
    heightFrom: number
    height: number
  }>

  // RAL Painting
  painting?: boolean
  ralCode?: string
  ralColor?: string
  ralPriceModifier?: number

  // 3D state data (connector types and sciskane handles positions)
  connectorTypes?: string[]
  wspornikTypes?: string[]
  sciskaneHandles?: Array<{ offsetFromBottom: number; connType: string }>
  // Wysokości do opłaty stałej (w mm)
  lastHoopToGround?: number
  lastRungToGround?: number
}

export interface ConfigResult {
  config: LadderConfig
  components: Array<{
    id: string
    name: string
    quantity: number
    unit?: string
    unitPrice?: number
  }>
  pricing: {
    netto: number
    vat: number
    brutto: number
  }
}

export type MessageType =
  | 'LOAD_CONFIG'      // Parent -> Iframe: Load configuration
  | 'GET_CONFIG'       // Parent -> Iframe: Request current config
  | 'CONFIG_RESULT'    // Iframe -> Parent: Send config/pricing result
  | 'CONFIG_CHANGED'   // Iframe -> Parent: Notify config changed
  | 'READY'            // Iframe -> Parent: Configurator is ready

export interface PostMessageData {
  type: MessageType
  payload?: LadderConfig | ConfigResult | null
}

type MessageHandler = (data: PostMessageData) => void

class PostMessageService {
  private handlers: Map<MessageType, MessageHandler[]> = new Map()
  private parentOrigin: string = '*'
  private isListening: boolean = false

  /**
   * Start listening for postMessage events
   */
  startListening(allowedOrigin?: string): void {
    if (this.isListening) return

    if (allowedOrigin) {
      this.parentOrigin = allowedOrigin
    }

    window.addEventListener('message', this.handleMessage.bind(this))
    this.isListening = true

    console.log('[PostMessage] Started listening for messages')
  }

  /**
   * Stop listening for postMessage events
   */
  stopListening(): void {
    if (!this.isListening) return

    window.removeEventListener('message', this.handleMessage.bind(this))
    this.isListening = false

    console.log('[PostMessage] Stopped listening')
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    // Validate origin if specified
    if (this.parentOrigin !== '*' && event.origin !== this.parentOrigin) {
      console.warn('[PostMessage] Rejected message from:', event.origin)
      return
    }

    const data = event.data as PostMessageData

    // Validate message structure
    if (!data || typeof data.type !== 'string') {
      return
    }

    console.log('[PostMessage] Received:', data.type, data.payload)

    // Call registered handlers
    const handlers = this.handlers.get(data.type) || []
    handlers.forEach(handler => handler(data))
  }

  /**
   * Register handler for message type
   */
  on(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type) || []
    handlers.push(handler)
    this.handlers.set(type, handlers)
  }

  /**
   * Remove handler for message type
   */
  off(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type) || []
    const index = handlers.indexOf(handler)
    if (index > -1) {
      handlers.splice(index, 1)
      this.handlers.set(type, handlers)
    }
  }

  /**
   * Send message to parent window
   */
  sendToParent(type: MessageType, payload?: LadderConfig | ConfigResult | null): void {
    if (!window.parent || window.parent === window) {
      console.warn('[PostMessage] Not in iframe, cannot send to parent')
      return
    }

    const message: PostMessageData = { type, payload }
    window.parent.postMessage(message, this.parentOrigin)

    console.log('[PostMessage] Sent to parent:', type)
  }

  /**
   * Notify parent that configurator is ready
   */
  notifyReady(): void {
    this.sendToParent('READY')
  }

  /**
   * Send config result to parent
   */
  sendConfigResult(result: ConfigResult): void {
    this.sendToParent('CONFIG_RESULT', result)
  }

  /**
   * Notify parent that config changed
   */
  notifyConfigChanged(config: LadderConfig): void {
    this.sendToParent('CONFIG_CHANGED', config)
  }
}

// Export singleton instance
export const postMessageService = new PostMessageService()

// Export class for testing
export { PostMessageService }
