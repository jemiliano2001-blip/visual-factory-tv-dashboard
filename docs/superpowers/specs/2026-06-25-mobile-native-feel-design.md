# Mobile Native Feel — Design Spec
**Fecha:** 2026-06-25  
**Proyecto:** Visual Factory TV Dashboard  
**Alcance:** Mejoras UX/UI en móvil — fixes críticos + Bottom Sheets + haptic feedback

---

## Contexto

El dashboard se usa en móvil por operadores de planta que necesitan consultar el estado de órdenes rápidamente. Las screenshots del 2026-06-25 revelaron 5 problemas que degradan la experiencia móvil:

1. Pagination dots de 4px — imposibles de tocar
2. Scrollbar nativo visible en Android Chrome (modal + tabla)
3. Badges en `text-[8px]` — ilegibles
4. Modal de detalle: 3 cards apiladas desperdician altura vertical
5. Botón mic descentrado por `max-md:invisible` que reserva espacio

Este spec cubre 3 capas de mejora: fixes de base (sprint B), bottom sheets para modal + filtros, y haptic feedback.

---

## Decisiones de diseño

### Librería: Vaul vía shadcn Drawer
`npx shadcn@latest add drawer` instala vaul y genera `src/components/ui/drawer.tsx`. No se añade vaul directamente — se pasa siempre por shadcn para mantener coherencia con el sistema de diseño existente.

### Patrón responsive Dialog/Drawer
El `useMobile` hook ya existe en `src/hooks/useMobile.ts`. Se usa para decidir en runtime:
- **mobile (`isMobile === true`)** → `DrawerContent` (slide-up desde abajo, swipe-to-close)
- **desktop/TV (`isMobile === false`)** → `DialogContent` existente (sin cambios)

El contenido del modal (header, fields, tabla) se extrae a un componente compartido `OrderDetailsContent` para no duplicar JSX.

### TVControlBar: filtro cliente como Drawer
La barra de búsqueda (`<Input>` + botón SlidersHorizontal) permanece siempre visible. Al tocar el botón de filtros, se abre un `Drawer` desde abajo mostrando la lista de clientes como items táctiles (`min-h-[44px]`). Esto reemplaza el `showClientSelect` → `<Select>` inline actual.

### Scrollbar
Clase utility en `globals.css`:
```css
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```
Se aplica a todos los contenedores `overflow-y-auto` del modal y la tabla.

### Dots de paginación
Cada dot se envuelve en un `<button>` con padding invisible (`p-3`) para alcanzar 44×44px de área táctil. El visual del dot no cambia.

### Haptic
`navigator.vibrate(10)` en el handler del mic (solo al iniciar grabación, no al detener). Guard: `if ('vibrate' in navigator)` — no rompe en iOS que no lo soporta.

---

## Archivos afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/components/ui/drawer.tsx` | Nuevo — generado por `shadcn add drawer` |
| `src/components/OrderDetailsModal.tsx` | Wrapper responsive + `OrderDetailsContent` interno |
| `src/components/TVControlBar.tsx` | Mobile filter: `showClientSelect` inline → Drawer |
| `src/components/DashboardFooter.tsx` | Dots hit-area, `invisible`→`hidden`, haptic |
| `src/components/OdooOrderCard.tsx` | Badge `text-[8px]`→`text-[10px]` en mobile layout |
| `src/index.css` | `.no-scrollbar` utility |

---

## Especificación detallada

### 1. Scrollbar global (`globals.css`)
```css
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```
Aplicar clase `no-scrollbar` a:
- `OrderDetailsModal.tsx:61` — div `overflow-y-auto flex-1`
- `OrderDetailsModal.tsx:106` — div `max-h-[350px] overflow-auto`
- `DrawerContent` body (en OrderDetailsModal y TVControlBar)

### 2. `DashboardFooter.tsx`
**Dots de paginación** (línea ~50):
```tsx
// Antes:
<button
  key={idx}
  onClick={() => onPageChange(idx)}
  className={`h-1 rounded-full transition-all duration-500 ${...}`}
/>

// Después: wrapper con área táctil 44px
<button
  key={idx}
  onClick={() => onPageChange(idx)}
  className="p-3 -m-3 flex items-center justify-center"
>
  <div className={`h-1 rounded-full transition-all duration-500 ${...}`} />
</button>
```

**Footer legend** (línea ~100):
```tsx
// Antes: max-md:invisible (reserva espacio)
// Después: max-md:hidden (no reserva espacio)
<div className="flex-1 flex max-md:hidden items-center ...">
```

**Haptic en mic** (línea ~75):
```tsx
// En el onClick del botón mic:
onClick={() => {
  if (!isRecording && 'vibrate' in navigator) navigator.vibrate(10);
  onToggleRecording();
}}
```

### 3. `OdooOrderCard.tsx` — mobile layout
Líneas 177 y 181 (badges en isMobile layout):
```tsx
// Antes:
className={`text-[8px] font-black ...`}

// Después:
className={`text-[10px] font-black ...`}
```

### 4. `OrderDetailsModal.tsx` — responsive Dialog/Drawer
```tsx
import { useMobile } from '../hooks/useMobile';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';

const OrderDetailsContent: React.FC<{ order: OdooSaleOrder }> = ({ order }) => {
  // todo el JSX actual del body (campos + tabla + notas)
  // sin el Dialog/DrawerContent wrapper
};

export const OrderDetailsModal = ({ order, isOpen, onClose }) => {
  const isMobile = useMobile();
  if (!order) return null;

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[92dvh] flex flex-col bg-[#050505]/98 border-white/5">
          <DrawerHeader className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/6">
            {/* mismo header que el Dialog */}
          </DrawerHeader>
          <div className="overflow-y-auto no-scrollbar flex-1 p-4">
            <OrderDetailsContent order={order} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="...existing...">
        {/* igual que ahora */}
      </DialogContent>
    </Dialog>
  );
};
```

**Campos de detalle** — en `OrderDetailsContent`, los 3 campos en `grid-cols-1` se reorganizan en una sola card con 3 rows compactos (aplicable en ambas versiones mobile y desktop cuando hay poco espacio):
```tsx
// Una sola card, 3 rows
<div className="rounded-xl border border-white/5 bg-zinc-900/30 divide-y divide-white/5 mb-5">
  <div className="flex justify-between items-center px-4 py-3">
    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Creación</span>
    <span className="text-sm text-blue-400 font-medium">{orderDate ? format(orderDate,'dd/MM/yyyy HH:mm') : '-'}</span>
  </div>
  <div className="flex justify-between items-center px-4 py-3">
    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Entrega</span>
    <span className="text-sm text-blue-400 font-medium">{commitmentDate ? format(commitmentDate,'dd/MM/yyyy') : '-'}</span>
  </div>
  <div className="flex justify-between items-center px-4 py-3">
    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Responsable</span>
    <span className="text-sm text-blue-400 font-medium truncate max-w-[180px]">{order.salesperson || '-'}</span>
  </div>
</div>
```

### 5. `TVControlBar.tsx` — mobile filter → Drawer
```tsx
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';

// Reemplaza el showClientSelect + Select inline:
const [filterOpen, setFilterOpen] = useState(false);

// Botón SlidersHorizontal abre el Drawer:
<button onClick={() => setFilterOpen(true)} ...>
  <SlidersHorizontal />
</button>

// Drawer con lista de clientes como items táctiles:
<Drawer open={filterOpen} onOpenChange={setFilterOpen}>
  <DrawerContent className="bg-[#050505]/98 border-white/5">
    <DrawerHeader>
      <DrawerTitle>Filtrar por cliente</DrawerTitle>
    </DrawerHeader>
    <div className="p-4 space-y-1 overflow-y-auto no-scrollbar max-h-[60dvh] pb-safe">
      {[null, ...clients].map((c) => (
        <button
          key={c ?? '__all__'}
          onClick={() => { onClient(c); setFilterOpen(false); }}
          className={`w-full min-h-[44px] px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors ${
            (clientFilter ?? null) === c
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'text-zinc-300 hover:bg-white/5'
          }`}
        >
          {c ?? 'Todos los clientes'}
        </button>
      ))}
    </div>
  </DrawerContent>
</Drawer>
```

---

## Fuera de scope

- **Pull-to-refresh**: el botón de refresh en header cubre el caso. PR nativo en iOS/PWA conflicta con scroll y requiere un service worker handler adicional.
- **Swipe de página**: conflicto con sistema back gesture en Android.
- **Bottom sheet para otros dialogs** (confirmaciones, AIModal de admin): no se usan en móvil frecuentemente; se abordan en sprint posterior si hay feedback.

---

## Criterios de aceptación

- [ ] Abrir OrderDetailsModal en móvil → slide desde abajo, handle visible, swipe-down cierra
- [ ] Tocar botón SlidersHorizontal en móvil → Drawer con lista de clientes, cada item ≥44px
- [ ] Footer: dots de paginación responden al tap sin precisión milimétrica
- [ ] Footer: botón mic centrado horizontalmente
- [ ] Badges de prioridad/edad en cards legibles a distancia normal
- [ ] Scrollbar nativo no visible en modal ni en tabla de líneas
- [ ] Vibración corta al activar mic en Android (no rompe en iOS)
- [ ] TV/Desktop: sin cambios visuales ni funcionales
