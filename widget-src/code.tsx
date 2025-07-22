// Rust Type Modeler – FigJam Widget
// ------------------------------------------------------------
// struct / enum / trait / union / type_alias / module
// Chips: Lifetimes, Traits, Uses, Submodules
// Mutability chip on every property AND prefix on wrapper label
// Wrapper dropdown shown just under the chip (no layout shift)
// For `module`, there is **no Properties section**; "Variables" are just `Property` items.
// ------------------------------------------------------------

const { widget } = figma
const { useSyncedState, usePropertyMenu, AutoLayout, Text, SVG, Input } = widget

// ---------------------- Theme ----------------------
const THEME = {
  headerFill: '#4A4A4A',
  headerText: '#FFFFFF',
  headerTextMuted: '#FFFFFFB3',
  bodyFill: '#FAFAFA',
  sectionStroke: '#DADADA',
  textPrimary: '#333333',
  textMuted: '#808080',
  pillFill: '#4A4A4A',
  pillText: '#FFFFFF',
  sectionBg: '#FFFFFF',
  rootBg: '#F5F5F5',
  radius: 8,
}
function applyPrimary(color: string) {
  // --- small helpers (no padStart to keep ES2015 compatibility) ---
  const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => {
    const h = x.toString(16)
    return h.length === 1 ? '0' + h : h
  }).join('')
  const mix = (h1: string, h2: string, p: number) => {
    const a = hexToRgb(h1); const b = hexToRgb(h2)
    const r = Math.round(a.r + (b.r - a.r) * p)
    const g = Math.round(a.g + (b.g - a.g) * p)
    const bl = Math.round(a.b + (b.b - a.b) * p)
    return rgbToHex(r, g, bl)
  }

  // Assign primaries
  THEME.headerFill = color
  THEME.pillFill   = color

  // Text contrast on primary
  const contrast = contrastOn(color)
  THEME.headerText      = contrast
  THEME.pillText        = contrast
  THEME.headerTextMuted = withAlpha(contrast, 0.7)

  // ---------- Intelligent Secondary Palette ----------
  const isDark = luminance(color) < 0.5
  const { h } = hexToHsl(color)

  // Base defaults (good for most hues)
  let panelBg   = isDark ? mix(color, '#FFFFFF', 0.92) : mix(color, '#000000', 0.03)
  let rootBg    = isDark ? mix(panelBg, '#FFFFFF', 0.25) : mix(panelBg, '#FFFFFF', 0.6)
  let bodyBg    = isDark ? mix(panelBg, '#FFFFFF', 0.15) : mix(panelBg, '#000000', 0.02)
  let stroke    = isDark ? mix(color, '#FFFFFF', 0.7)  : mix(color, '#000000', 0.2)

  // Special-case warm yellows / oranges (h ≈ 40–75°): they need darker neutrals to avoid the "mustard" look
  if (h > 40 && h < 75) {
    // Yellow / orange hues: darken the header, lighten panels strongly so text stays readable
    const darkHeader = mix(color, '#000000', 0.30)
    THEME.headerFill = darkHeader
    THEME.pillFill   = darkHeader

    panelBg = mix(color, '#FFFFFF', 0.90)   // very light panel
    rootBg  = mix(color, '#FFFFFF', 0.97)   // almost white canvas
    bodyBg  = mix(color, '#FFFFFF', 0.94)
    stroke  = mix(color, '#000000', 0.22)

    // Recompute text contrast on the dark header/pills
    const hdrContrast = contrastOn(darkHeader)
    THEME.headerText      = hdrContrast
    THEME.pillText        = hdrContrast
    THEME.headerTextMuted = withAlpha(hdrContrast, 0.7)
  }

  THEME.sectionBg     = panelBg
  THEME.rootBg        = rootBg
  THEME.bodyFill      = bodyBg
  THEME.sectionStroke = stroke

  // Static text on secondary surfaces (dynamic for readability)
  const panelLum = luminance(panelBg)
  const baseText = panelLum > 0.6 ? '#222222' : '#F5F5F5'
  THEME.textPrimary = baseText
  THEME.textMuted   = withAlpha(baseText, 0.6)
}

const PALETTE = ['#4A4A4A', '#1E90FF', '#FF6B6B', '#8A2BE2', '#2ECC71', '#FFB400', '#FF00AA', '#00BFA5']
const DEFAULT_WIDTH = 640

// ---------------------- Types ----------------------
type RustTypeKind = 'struct' | 'enum' | 'trait' | 'union' | 'type_alias' | 'module'
interface Lifetime { id: string; name: string }
interface ImplTrait { id: string; name: string }

type WrapperKind =
  | 'value' | '&'
  | 'Box' | 'Rc' | 'Arc'
  | 'Vec' | 'Array'
  | 'Option' | 'Result'
  | 'HashMap' | 'BTreeMap'
  | 'RefCell' | 'Cell'
  | 'Pin' | 'Cow'

interface TypeToken { id: string; base: string; wrapper: WrapperKind; arrayLen?: number; lifetime?: string }
interface Property { id: string; name: string; mutable: boolean; ty: TypeToken }
interface MethodParam { id: string; name: string; ty: TypeToken }

type SelfReceiver = 'none' | 'self' | '&self' | '&mut self'
interface Method { id: string; name: string; receiver: SelfReceiver; inputs: MethodParam[]; outputs: TypeToken[]; desc: string }

type EnumVariantKind = 'unit' | 'tuple' | 'struct'
interface EnumVariant { id: string; name: string; kind: EnumVariantKind; fields: Property[] }

// Module extras
interface ModuleUse { id: string; path: string }
interface ModuleTypeDecl { id: string; name: string }
interface SubModule { id: string; name: string }

interface RustTypeModel {
  kind: RustTypeKind
  name: string
  desc: string
  lifetimes: Lifetime[]
  impls: ImplTrait[]
  properties: Property[]
  methods: Method[]
  enumVariants?: EnumVariant[]
  moduleUses?: ModuleUse[]
  moduleTypes?: ModuleTypeDecl[]
  submodules?: SubModule[]
}

// ---------------------- Utils ----------------------
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
const WRAPPER_OPTIONS: WrapperKind[] = ['value','&','Box','Rc','Arc','Vec','Array','Option','Result','HashMap','BTreeMap','RefCell','Cell','Pin','Cow']
const SELF_RECEIVERS: SelfReceiver[] = ['none', 'self', '&self', '&mut self']
function cycle<T>(arr: readonly T[], cur: T): T { const i = arr.indexOf(cur); return arr[(i + 1) % arr.length] }
const HEX_RE = /^#([0-9a-fA-F]{6})$/

// ---- color utils to keep good contrast with chosen primary ----
function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return { r: 74, g: 74, b: 74 }
  const int = parseInt(m[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}
function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrastOn(hex: string) { return luminance(hex) > 0.5 ? '#000000' : '#FFFFFF' }
function withAlpha(hex: string, alpha: number) {
  // Avoid String.padStart to stay compatible with the FigJam widget TS lib (ES2015)
  const n = Math.round(alpha * 255)
  const h = n.toString(16)
  const a = h.length === 1 ? '0' + h : h
  return hex + a
}
function hexToHsl(hex: string){
  const { r, g, b } = hexToRgb(hex)
  const rf = r/255, gf = g/255, bf = b/255
  const max = Math.max(rf,gf,bf), min = Math.min(rf,gf,bf)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0){
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch(max){
      case rf: h = (gf - bf) / d + (gf < bf ? 6 : 0); break
      case gf: h = (bf - rf) / d + 2; break
      case bf: h = (rf - gf) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

function chipWidth(str: string): number { return Math.max((str ? str.length : 0) * 7 + 24, 40) }

// ---------------------- Icons ----------------------
const PLUS_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M7 7V3h2v4h4v2H9v4H7V9H3V7h4z" fill="white"/></svg>`
const MINUS_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7" width="10" height="2" fill="white"/></svg>`
const FILE_ICON_SVG = `<svg width='20' height='20' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'><path d='M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z' fill='white' fill-opacity='0.15'/><path d='M15 2v5h5' stroke='white' stroke-opacity='0.4' stroke-width='1.5' fill='none'/><path d='M8 14h8M8 11h8M8 17h5' stroke='white' stroke-opacity='0.6' stroke-width='1.5' stroke-linecap='round'/></svg>`
const RESET_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3V1L4 4.5L8 8V6C10.21 6 12 7.79 12 10C12 12.21 10.21 14 8 14C5.79 14 4 12.21 4 10H2C2 13.31 4.69 16 8 16C11.31 16 14 13.31 14 10C14 6.69 11.31 4 8 4V3Z" fill="white"/></svg>`

// lock = immutable (dark icon); unlock = mutable (white icon over red bg)
const LOCK_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 7V5a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1Zm2-2v2h4V5a2 2 0 0 0-4 0Z" fill="#4A4A4A"/></svg>`
const UNLOCK_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M11 7V5a3 3 0 0 0-6 0h1.5a1.5 1.5 0 1 1 3 0v2h2.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h8Z" fill="#FFFFFF"/></svg>`

// ---------------------- Small UI atoms ----------------------
function Pill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <AutoLayout padding={{ horizontal: 12, vertical: 6 }} cornerRadius={6} fill={THEME.pillFill} onClick={onClick} hoverStyle={{ opacity: 0.9 }}>
      <Text fontSize={12} fill={THEME.pillText}>{label}</Text>
    </AutoLayout>
  )
}
function IconButton({ svg, onClick, tooltip, bg = THEME.pillFill, size = 18 }: { svg: string; onClick: () => void; tooltip?: string; bg?: string; size?: number }) {
  return (
    <AutoLayout width={size} height={size} cornerRadius={size / 2} fill={bg} verticalAlignItems={'center'} horizontalAlignItems={'center'} onClick={onClick} tooltip={tooltip ?? ''} hoverStyle={{ opacity: 0.9 }}>
      <SVG src={svg} width={size * 0.6} height={size * 0.6} />
    </AutoLayout>
  )
}

// ---------------------- ChipInput ----------------------
function ChipInput({ value, placeholder, onChange, onRemove }: { value: string; placeholder: string; onChange: (v: string) => void; onRemove: () => void }) {
  const w = chipWidth(value || placeholder)
  return (
    <AutoLayout spacing={4} verticalAlignItems={'center'} width={'hug-contents'} padding={{ horizontal: 6, vertical: 2 }} fill={'#FFFFFF33'} cornerRadius={10}>
      <Input value={value} placeholder={placeholder} fontSize={12} fill={THEME.headerText} width={w} onTextEditEnd={e => onChange(e.characters)} />
      <IconButton svg={MINUS_SVG} onClick={onRemove} tooltip={'Remove'} bg={'#FFFFFF00'} size={12} />
    </AutoLayout>
  )
}

// ---------------------- Color Picker ----------------------
function ColorPicker({ current, onPick, onClose }: { current: string; onPick: (c: string) => void; onClose: () => void }) {
  return (
    <AutoLayout direction={'vertical'} spacing={8} padding={12} fill={'#FFFFFF'} stroke={'#CCCCCC'} cornerRadius={8} width={'hug-contents'}>
      <Text fontSize={12} fill={'#333'}>Primary color</Text>
      <AutoLayout spacing={6} wrap>
        {PALETTE.map(c => (
          <AutoLayout key={c} width={22} height={22} cornerRadius={6} fill={c} stroke={c === current ? '#000000' : '#FFFFFF'} strokeWidth={c === current ? 1 : 0} onClick={() => { onPick(c); onClose(); }} />
        ))}
      </AutoLayout>
      <AutoLayout spacing={4} verticalAlignItems={'center'}>
        <Text fontSize={11} fill={'#666'}>#</Text>
        <Input value={current.replace('#','')} placeholder={'rrggbb'} fontSize={11} width={70} onTextEditEnd={e => {
          const v = '#' + e.characters.replace(/[^0-9a-fA-F]/g, '')
          if (HEX_RE.test(v)) { onPick(v); onClose(); }
        }} />
      </AutoLayout>
      <Pill label={'Close'} onClick={onClose} />
    </AutoLayout>
  )
}

// ---------------------- Wrapper Dropdown ----------------------
function WrapperDropdown({ current, onPick, onClose }: { current: WrapperKind; onPick: (w: WrapperKind)=>void; onClose: ()=>void }) {
  return (
    <AutoLayout direction={'vertical'} spacing={2} padding={6} fill={'#FFFFFF'} stroke={'#CCCCCC'} cornerRadius={6} width={'hug-contents'}>
      {WRAPPER_OPTIONS.map(w => (
        <AutoLayout key={w} padding={{ horizontal: 6, vertical: 2 }} cornerRadius={4} fill={w === current ? '#00000011' : '#FFFFFF00'} hoverStyle={{ fill: '#00000011' }} onClick={() => { onPick(w); onClose(); }}>
          <Text fontSize={11} fill={'#333'}>{w}</Text>
        </AutoLayout>
      ))}
    </AutoLayout>
  )
}

// ---------------------- Editors ----------------------
function TypeTokenEditor({ token, onChange, mutPrefix }: { token: TypeToken; onChange: (t: TypeToken) => void; mutPrefix?: boolean }) {
  const isRef = token.wrapper === '&'
  const displayWrapper = (mutPrefix ? 'mut ' : '') + (isRef ? '&' : token.wrapper)
  const [ddOpen, setDdOpen] = useSyncedState<boolean>('wrap_' + token.id, false)

  return (
    <AutoLayout spacing={4} verticalAlignItems={'start'} width={'hug-contents'} direction={'vertical'}>
      {/* row */}
      <AutoLayout spacing={4} verticalAlignItems={'center'} width={'hug-contents'}>
        <AutoLayout padding={{ horizontal: 6, vertical: 2 }} cornerRadius={6} fill={'#FFFFFF22'} hoverStyle={{ opacity: 0.9 }} onClick={() => setDdOpen(!ddOpen)}>
          <Text fontSize={11} fill={THEME.textMuted}>{displayWrapper}</Text>
        </AutoLayout>
        <Input value={token.lifetime ?? '\''} placeholder={'\'a'} fontSize={12} width={28} onTextEditEnd={e => onChange({ ...token, lifetime: e.characters })} />
        <Input value={token.base} placeholder={'Type'} fontSize={12} width={100} onTextEditEnd={e => onChange({ ...token, base: e.characters })} />
        {token.wrapper === 'Array' && (
          <Input value={String(token.arrayLen ?? 0)} placeholder={'len'} fontSize={12} width={30} onTextEditEnd={e => {
            const v = parseInt(e.characters, 10)
            onChange({ ...token, arrayLen: Number.isFinite(v) ? v : undefined })
          }} />
        )}
      </AutoLayout>
      {ddOpen && (
        <WrapperDropdown current={token.wrapper} onPick={(w) => { onChange({ ...token, wrapper: w }); setDdOpen(false) }} onClose={() => setDdOpen(false)} />
      )}
    </AutoLayout>
  )
}

function PropertyHeaderRow() {
  return (
    <AutoLayout
      width={'fill-parent'}
      spacing={8}
      verticalAlignItems={'center'}
      padding={{ horizontal: 16, vertical: 6 }}
      fill={withAlpha(THEME.textPrimary, 0.08)}
      cornerRadius={4}
    >
      <Text fontSize={10} fill={THEME.textMuted} width={28} horizontalAlignText={'center'}>mut</Text>
      <Text fontSize={10} fill={THEME.textMuted} width={100}>name</Text>
      <Text fontSize={10} fill={THEME.textMuted}>type</Text>
    </AutoLayout>
  )
}

function PropertyRow({ prop, onChange, onRemove }: { prop: Property; onChange: (p: Property) => void; onRemove: () => void }) {
  const toggleMut = () => onChange({ ...prop, mutable: !prop.mutable })
  return (
    <AutoLayout spacing={8} verticalAlignItems={'center'} width={'fill-parent'}>
      <IconButton svg={prop.mutable ? UNLOCK_SVG : LOCK_SVG} onClick={toggleMut} tooltip={prop.mutable ? 'Make immutable' : 'Make mutable'} bg={prop.mutable ? '#FF6B6B' : '#FFFFFF22'} size={18} />
      <Input value={prop.name} placeholder={'property'} fontSize={12} width={100} onTextEditEnd={e => onChange({ ...prop, name: e.characters })} />
      <TypeTokenEditor token={prop.ty} onChange={t => onChange({ ...prop, ty: t })} mutPrefix={prop.mutable} />
      <IconButton svg={MINUS_SVG} onClick={onRemove} tooltip={'Remove property'} size={18} />
    </AutoLayout>
  )
}

function ParamRow({ param, onChange, onRemove }: { param: MethodParam; onChange: (p: MethodParam) => void; onRemove: () => void }) {
  return (
    <AutoLayout spacing={6} verticalAlignItems={'center'}>
      <Input value={param.name} placeholder={'arg'} fontSize={12} width={80} onTextEditEnd={e => onChange({ ...param, name: e.characters })} />
      <TypeTokenEditor token={param.ty} onChange={t => onChange({ ...param, ty: t })} />
      <IconButton svg={MINUS_SVG} onClick={onRemove} tooltip={'Remove param'} size={18} />
    </AutoLayout>
  )
}

function MethodRow({ method, onChange, onRemove }: { method: Method; onChange: (m: Method) => void; onRemove: () => void }) {
  const updateOutputs = (idx: number, token: TypeToken) => {
    const arr = [...method.outputs]; arr[idx] = token; onChange({ ...method, outputs: arr })
  }
  return (
    <AutoLayout direction={'vertical'} spacing={6} padding={{ vertical: 8 }} width={'fill-parent'}>
      <AutoLayout spacing={8} verticalAlignItems={'center'} width={'fill-parent'}>
        <Input value={method.name} placeholder={'fn name'} fontSize={12} width={120} onTextEditEnd={e => onChange({ ...method, name: e.characters })} />
        <Text fontSize={12} fill={THEME.textMuted} onClick={() => onChange({ ...method, receiver: cycle(SELF_RECEIVERS, method.receiver) })}>{method.receiver}</Text>
        <IconButton svg={MINUS_SVG} onClick={onRemove} tooltip={'Remove method'} size={18} />
      </AutoLayout>

      <SectionSub title={'Inputs'}>
        {method.inputs.map((p, i) => (
          <ParamRow key={p.id} param={p} onChange={np => { const arr = [...method.inputs]; arr[i] = np; onChange({ ...method, inputs: arr }) }} onRemove={() => onChange({ ...method, inputs: method.inputs.filter(x => x.id !== p.id) })} />
        ))}
        <Pill label={'Add param'} onClick={() => onChange({ ...method, inputs: [...method.inputs, { id: uid(), name: 'arg', ty: defaultTypeToken() }] })} />
      </SectionSub>

      <SectionSub title={'Outputs'}>
        {method.outputs.map((t, i) => (
          <AutoLayout key={t.id} spacing={2} verticalAlignItems={'center'} width={'hug-contents'} padding={{ horizontal: 4, vertical: 1 }} fill={'#FFFFFF33'} cornerRadius={10}>
            <TypeTokenEditor token={t} onChange={tok => updateOutputs(i, tok)} />
            <IconButton svg={MINUS_SVG} onClick={() => onChange({ ...method, outputs: method.outputs.filter(x => x.id !== t.id) })} tooltip={'Remove output'} size={18} />
          </AutoLayout>
        ))}
        <Pill label={'Add output'} onClick={() => onChange({ ...method, outputs: [...method.outputs, defaultTypeToken()] })} />
      </SectionSub>

      <Input value={method.desc} placeholder={'description'} fontSize={12} width={240} onTextEditEnd={e => onChange({ ...method, desc: e.characters })} />
    </AutoLayout>
  )
}

// ---------- Simple StringRow util ----------
function StringRow({ value, placeholder, onChange, onRemove }: { value: string; placeholder: string; onChange: (v: string) => void; onRemove: () => void }) {
  return (
    <AutoLayout spacing={6} verticalAlignItems={'center'} width={'fill-parent'}>
      <Input value={value} placeholder={placeholder} fontSize={12} width={220} onTextEditEnd={e => onChange(e.characters)} />
      <IconButton svg={MINUS_SVG} onClick={onRemove} tooltip={'Remove'} size={18} />
    </AutoLayout>
  )
}

// ---------------------- Enum UI ----------------------
function VariantRow({ variant, onChange, onRemove }: { variant: EnumVariant; onChange: (v: EnumVariant) => void; onRemove: () => void }) {
  const setKind = () => onChange({ ...variant, kind: cycle(['unit','tuple','struct'], variant.kind) as EnumVariantKind })
  const updateField = (idx: number, p: Property) => { const arr = [...variant.fields]; arr[idx] = p; onChange({ ...variant, fields: arr }) }
  return (
    <AutoLayout direction={'vertical'} spacing={4} width={'fill-parent'}>
      <AutoLayout spacing={8} verticalAlignItems={'center'}>
        <Input value={variant.name} placeholder={'Variant'} fontSize={12} width={120} onTextEditEnd={e => onChange({ ...variant, name: e.characters })} />
        <Text fontSize={12} fill={THEME.textMuted} onClick={setKind}>{variant.kind}</Text>
        <IconButton svg={MINUS_SVG} onClick={onRemove} tooltip={'Remove variant'} size={18} />
      </AutoLayout>
      {variant.kind !== 'unit' && (
        <AutoLayout direction={'vertical'} spacing={4}>
          {variant.fields.map((f, i) => (
            <PropertyRow key={f.id} prop={f} onChange={np => updateField(i, np)} onRemove={() => onChange({ ...variant, fields: variant.fields.filter(x => x.id !== f.id) })} />
          ))}
          <Pill label={'Add property'} onClick={() => onChange({ ...variant, fields: [...variant.fields, defaultProperty()] })} />
        </AutoLayout>
      )}
    </AutoLayout>
  )
}
function EnumSection({ variants, onChange }: { variants: EnumVariant[]; onChange: (v: EnumVariant[]) => void }) {
  return (
    <SectionPanel title="Variants">
      {variants.map(v => (
        <VariantRow key={v.id} variant={v} onChange={nv => onChange(variants.map(x => x.id === v.id ? nv : x))} onRemove={() => onChange(variants.filter(x => x.id !== v.id))} />
      ))}
      <Pill label={'Add variant'} onClick={() => onChange([...variants, defaultVariant()])} />
    </SectionPanel>
  )
}

// ---------------------- Layout helpers ----------------------
function SectionSub({ title, children }: { title: string; children: any }) {
  return (
    <AutoLayout direction={'vertical'} spacing={4} width={'fill-parent'}>
      <Text fontSize={13} fill={THEME.textMuted}>{title}</Text>
      <AutoLayout direction={'vertical'} spacing={4} width={'fill-parent'}>
        {children}
      </AutoLayout>
    </AutoLayout>
  )
}
function SectionPanel({ title, children }: { title: string; children: any }) {
  return (
    <AutoLayout direction={'vertical'} width={'fill-parent'} stroke={THEME.sectionStroke} fill={THEME.sectionBg} cornerRadius={THEME.radius}>
      <AutoLayout padding={{ horizontal: 16, vertical: 12 }} spacing={8} verticalAlignItems={'center'} width={'fill-parent'}>
        <Text fontSize={16} fill={THEME.textPrimary}>{title}</Text>
      </AutoLayout>
      <AutoLayout direction={'vertical'} spacing={8} padding={{ horizontal: 16, bottom: 16 }} width={'fill-parent'}>
        {children}
      </AutoLayout>
    </AutoLayout>
  )
}

// ---------------------- Header ----------------------
function HeaderBar({
  kind, name, desc,
  lifetimes, impls, moduleUses, submodules,
  onName, onDesc,
  onAddLifetime, onEditLifetime, onRemoveLifetime,
  onAddImpl, onEditImpl, onRemoveImpl,
  onAddUse, onEditUse, onRemoveUse,
  onAddSubmodule, onEditSubmodule, onRemoveSubmodule,
}: {
  kind: RustTypeKind; name: string; desc: string;
  lifetimes: Lifetime[]; impls: ImplTrait[]; moduleUses: ModuleUse[]; submodules: SubModule[];
  onName: (s: string) => void; onDesc: (s: string) => void;
  onAddLifetime: () => void; onEditLifetime: (id: string, v: string) => void; onRemoveLifetime: (id: string) => void;
  onAddImpl: () => void; onEditImpl: (id: string, v: string) => void; onRemoveImpl: (id: string) => void;
  onAddUse: () => void; onEditUse: (id: string, v: string) => void; onRemoveUse: (id: string) => void;
  onAddSubmodule: () => void; onEditSubmodule: (id: string, v: string) => void; onRemoveSubmodule: (id: string) => void;
}) {
  return (
    <AutoLayout fill={THEME.headerFill} padding={{ horizontal: 16, vertical: 12 }} cornerRadius={{ topLeft: THEME.radius, topRight: THEME.radius, bottomLeft: 0, bottomRight: 0 }} direction={'vertical'} spacing={8} width={'fill-parent'}>
      <Text fontSize={14} fill={THEME.headerText}>{`<< ${kind === 'trait' ? 'interface' : kind} >>`}</Text>

      <AutoLayout direction={'horizontal'} width={'fill-parent'} spacing={16} verticalAlignItems={'start'}>
        {/* left */}
        <AutoLayout direction={'vertical'} spacing={8} width={'fill-parent'}>
          <AutoLayout spacing={8} verticalAlignItems={'center'}>
            <SVG src={FILE_ICON_SVG} width={20} height={20} />
            <Input value={name} placeholder={'Type name'} fontSize={24} fontWeight={'bold'} fill={THEME.headerText} width={220} onTextEditEnd={e => onName(e.characters)} />
          </AutoLayout>
          <Input value={desc} placeholder={'Description'} fontSize={14} fill={THEME.headerTextMuted} width={320} onTextEditEnd={e => onDesc(e.characters)} />
        </AutoLayout>

        {/* right */}
        <AutoLayout direction={'vertical'} spacing={8} width={'fill-parent'}>
          {kind !== 'module' ? (
            <>
              <AutoLayout spacing={6} verticalAlignItems={'center'} wrap width={'fill-parent'}>
                <Text fontSize={12} fill={THEME.headerTextMuted}>Lifetimes:</Text>
                {lifetimes.map(l => (
                  <ChipInput key={l.id} value={l.name} placeholder={`'a`} onChange={v => onEditLifetime(l.id, v)} onRemove={() => onRemoveLifetime(l.id)} />
                ))}
                <Pill label={'+'} onClick={onAddLifetime} />
              </AutoLayout>
              <AutoLayout spacing={6} verticalAlignItems={'center'} wrap width={'fill-parent'}>
                <Text fontSize={12} fill={THEME.headerTextMuted}>Traits:</Text>
                {impls.map(t => (
                  <ChipInput key={t.id} value={t.name} placeholder={'Display'} onChange={v => onEditImpl(t.id, v)} onRemove={() => onRemoveImpl(t.id)} />
                ))}
                <Pill label={'+'} onClick={onAddImpl} />
              </AutoLayout>
            </>
          ) : (
            <>
              <AutoLayout spacing={6} verticalAlignItems={'center'} wrap width={'fill-parent'}>
                <Text fontSize={12} fill={THEME.headerTextMuted}>Uses:</Text>
                {moduleUses.map(u => (
                  <ChipInput key={u.id} value={u.path} placeholder={'crate::path'} onChange={v => onEditUse(u.id, v)} onRemove={() => onRemoveUse(u.id)} />
                ))}
                <Pill label={'+'} onClick={onAddUse} />
              </AutoLayout>
              <AutoLayout spacing={6} verticalAlignItems={'center'} wrap width={'fill-parent'}>
                <Text fontSize={12} fill={THEME.headerTextMuted}>Submodules:</Text>
                {submodules.map(s => (
                  <ChipInput key={s.id} value={s.name} placeholder={'submod'} onChange={v => onEditSubmodule(s.id, v)} onRemove={() => onRemoveSubmodule(s.id)} />
                ))}
                <Pill label={'+'} onClick={onAddSubmodule} />
              </AutoLayout>
            </>
          )}
        </AutoLayout>
      </AutoLayout>
    </AutoLayout>
  )
}

// ---------------------- Defaults ----------------------
function defaultTypeToken(): TypeToken { return { id: uid(), base: 'u32', wrapper: 'value' } }
function defaultProperty(): Property { return { id: uid(), name: 'property', mutable: false, ty: defaultTypeToken() } }
function defaultMethod(): Method { return { id: uid(), name: 'new', receiver: 'none', inputs: [], outputs: [], desc: '' } }
function defaultVariant(): EnumVariant { return { id: uid(), name: 'Variant', kind: 'unit', fields: [] } }
function defaultUse(): ModuleUse { return { id: uid(), path: 'crate::path' } }
function defaultTypeDecl(): ModuleTypeDecl { return { id: uid(), name: 'MyType' } }
function defaultSubmodule(): SubModule { return { id: uid(), name: 'submod' } }

function defaultModel(): RustTypeModel {
  return { kind: 'struct', name: 'MyType', desc: '', lifetimes: [], impls: [], properties: [], methods: [] }
}

function normalizeForKind(m: RustTypeModel, k: RustTypeKind): RustTypeModel {
  if (k === 'enum') return { ...m, kind: k, properties: [], enumVariants: m.enumVariants ?? [defaultVariant()], moduleUses: undefined, moduleTypes: undefined, submodules: undefined }
  if (k === 'trait') return { ...m, kind: k, properties: [], enumVariants: undefined, moduleUses: undefined, moduleTypes: undefined, submodules: undefined }
  if (k === 'module') return { ...m, kind: k, enumVariants: undefined, properties: m.properties ?? [], moduleUses: m.moduleUses ?? [], moduleTypes: m.moduleTypes ?? [], submodules: m.submodules ?? [] }
  return { ...m, kind: k, enumVariants: undefined, moduleUses: undefined, moduleTypes: undefined, submodules: undefined }
}

// ---------------------- Widget Root ----------------------
function Widget() {
  const [model, setModel] = useSyncedState<RustTypeModel>('model', defaultModel())
  const [primaryColor, setPrimaryColor] = useSyncedState<string>('primaryColor', THEME.headerFill)
  const [pickerOpen, setPickerOpen] = useSyncedState<boolean>('pickerOpen', false)

  applyPrimary(primaryColor)

  const addField = () => setModel({ ...model, properties: [...model.properties, defaultProperty()] })
  const addMethod = () => setModel({ ...model, methods: [...model.methods, defaultMethod()] })
  const addVariant = () => setModel({ ...model, enumVariants: [...(model.enumVariants ?? []), defaultVariant()] })
  const addUse = () => setModel({ ...model, moduleUses: [...(model.moduleUses ?? []), defaultUse()] })
  const addTypeDecl = () => setModel({ ...model, moduleTypes: [...(model.moduleTypes ?? []), defaultTypeDecl()] })
  const addSubmodule = () => setModel({ ...model, submodules: [...(model.submodules ?? []), defaultSubmodule()] })

  // -------- Property Menu --------
  const menu: WidgetPropertyMenuItem[] = [
    { itemType: 'action', propertyName: 'reset', tooltip: 'Reset model', icon: RESET_SVG },
    {
      itemType: 'dropdown', propertyName: 'kind', tooltip: 'Type kind', selectedOption: model.kind,
      options: [
        { option: 'struct', label: 'struct' },
        { option: 'module', label: 'module' },
        { option: 'enum', label: 'enum' },
        { option: 'trait', label: 'trait' },
        { option: 'union', label: 'union' },
        { option: 'type_alias', label: 'type alias' },
      ],
    },
    { itemType: 'action', propertyName: 'pickColor', tooltip: 'Pick color' },
  ]
  if (model.kind === 'enum') menu.push({ itemType: 'action', propertyName: 'addVariant', tooltip: 'Add variant' })
  if (model.kind === 'struct' || model.kind === 'union' || model.kind === 'type_alias') menu.push({ itemType: 'action', propertyName: 'addField', tooltip: 'Add property' })
  if (model.kind === 'module') menu.push({ itemType: 'action', propertyName: 'addField', tooltip: 'Add variable' })
  if (model.kind !== 'type_alias') menu.push({ itemType: 'action', propertyName: 'addMethod', tooltip: 'Add method' })
  if (model.kind === 'module') {
    menu.push({ itemType: 'action', propertyName: 'addTypeDecl', tooltip: 'Add type' })
    menu.push({ itemType: 'action', propertyName: 'addUse', tooltip: 'Add use' })
    menu.push({ itemType: 'action', propertyName: 'addSubmodule', tooltip: 'Add submodule' })
  }

  usePropertyMenu(menu, (event) => {
    switch (event.propertyName) {
      case 'reset': setModel(defaultModel()); setPrimaryColor('#4A4A4A'); return
      case 'kind': {
        const v: any = (event as any).selectedOption ?? (event as any).propertyValue ?? (event as any).option
        if (v) setModel(normalizeForKind(model, v as RustTypeKind))
        return
      }
      case 'pickColor': setPickerOpen(true); return
      case 'addField': addField(); return
      case 'addMethod': addMethod(); return
      case 'addVariant': addVariant(); return
      case 'addUse': addUse(); return
      case 'addTypeDecl': addTypeDecl(); return
      case 'addSubmodule': addSubmodule(); return
    }
  })

  // -------- Render --------
  return (
    <AutoLayout direction={'vertical'} width={DEFAULT_WIDTH} spacing={8} fill={THEME.rootBg} padding={{ bottom: 8 }} cornerRadius={THEME.radius}>
      {pickerOpen && (
        <ColorPicker current={primaryColor} onPick={c => setPrimaryColor(c)} onClose={() => setPickerOpen(false)} />
      )}

      <HeaderBar
        kind={model.kind}
        name={model.name}
        desc={model.desc}
        lifetimes={model.lifetimes}
        impls={model.impls}
        moduleUses={model.moduleUses ?? []}
        submodules={model.submodules ?? []}
        onName={s => setModel({ ...model, name: s })}
        onDesc={s => setModel({ ...model, desc: s })}
        onAddLifetime={() => setModel({ ...model, lifetimes: [...model.lifetimes, { id: uid(), name: "'a" }] })}
        onEditLifetime={(id, v) => setModel({ ...model, lifetimes: model.lifetimes.map(x => x.id === id ? { ...x, name: v } : x) })}
        onRemoveLifetime={id => setModel({ ...model, lifetimes: model.lifetimes.filter(x => x.id !== id) })}
        onAddImpl={() => setModel({ ...model, impls: [...model.impls, { id: uid(), name: 'Clone' }] })}
        onEditImpl={(id, v) => setModel({ ...model, impls: model.impls.map(x => x.id === id ? { ...x, name: v } : x) })}
        onRemoveImpl={id => setModel({ ...model, impls: model.impls.filter(x => x.id !== id) })}
        onAddUse={() => setModel({ ...model, moduleUses: [...(model.moduleUses ?? []), defaultUse()] })}
        onEditUse={(id, v) => setModel({ ...model, moduleUses: (model.moduleUses ?? []).map(x => x.id === id ? { ...x, path: v } : x) })}
        onRemoveUse={id => setModel({ ...model, moduleUses: (model.moduleUses ?? []).filter(x => x.id !== id) })}
        onAddSubmodule={() => setModel({ ...model, submodules: [...(model.submodules ?? []), defaultSubmodule()] })}
        onEditSubmodule={(id, v) => setModel({ ...model, submodules: (model.submodules ?? []).map(x => x.id === id ? { ...x, name: v } : x) })}
        onRemoveSubmodule={id => setModel({ ...model, submodules: (model.submodules ?? []).filter(x => x.id !== id) })}
      />

      {model.kind === 'enum' && (
        <EnumSection variants={model.enumVariants ?? []} onChange={vs => setModel({ ...model, enumVariants: vs })} />
      )}

      {model.kind === 'module' && (
        <>
          <SectionPanel title="Types">
            {(model.moduleTypes ?? []).map(t => (
              <StringRow key={t.id} value={t.name} placeholder={'TypeName'} onChange={v => setModel({ ...model, moduleTypes: (model.moduleTypes ?? []).map(x => x.id === t.id ? { ...x, name: v } : x) })} onRemove={() => setModel({ ...model, moduleTypes: (model.moduleTypes ?? []).filter(x => x.id !== t.id) })} />
            ))}
            <Pill label={'Add type'} onClick={addTypeDecl} />
          </SectionPanel>

          <SectionPanel title="Variables">
            <PropertyHeaderRow />
            {model.properties.map(p => (
              <PropertyRow key={p.id} prop={p} onChange={np => setModel({ ...model, properties: model.properties.map(x => x.id === p.id ? np : x) })} onRemove={() => setModel({ ...model, properties: model.properties.filter(x => x.id !== p.id) })} />
            ))}
            <Pill label={'Add variable'} onClick={addField} />
          </SectionPanel>
        </>
      )}

      {(model.kind === 'struct' || model.kind === 'union' || model.kind === 'type_alias') && (
        <SectionPanel title="Properties">
          <PropertyHeaderRow />
          {model.properties.map(p => (
            <PropertyRow key={p.id} prop={p} onChange={np => setModel({ ...model, properties: model.properties.map(x => x.id === p.id ? np : x) })} onRemove={() => setModel({ ...model, properties: model.properties.filter(x => x.id !== p.id) })} />
          ))}
          <Pill label={'Add property'} onClick={addField} />
        </SectionPanel>
      )}

      {model.kind !== 'type_alias' && (
        <SectionPanel title="Methods">
          {model.methods.map(m => (
            <MethodRow key={m.id} method={m} onChange={nm => setModel({ ...model, methods: model.methods.map(x => x.id === m.id ? nm : x) })} onRemove={() => setModel({ ...model, methods: model.methods.filter(x => x.id !== m.id) })} />
          ))}
          <Pill label={'Add method'} onClick={addMethod} />
        </SectionPanel>
      )}
    </AutoLayout>
  )
}

widget.register(Widget)
