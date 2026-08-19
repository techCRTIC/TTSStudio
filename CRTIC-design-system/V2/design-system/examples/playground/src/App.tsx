import { Button, ConnectiveLine, Eyebrow, Reveal, Section, useSmoothScroll } from '../../../react'

const SWATCHES: { name: string; var: string; ring?: boolean }[] = [
  { name: 'snow', var: '--crtic-snow', ring: true },
  { name: 'card', var: '--crtic-card', ring: true },
  { name: 'ink', var: '--crtic-ink' },
  { name: 'ink-2', var: '--crtic-ink-2' },
  { name: 'hairline', var: '--crtic-hairline', ring: true },
  { name: 'orange', var: '--crtic-orange' },
]

export function App() {
  useSmoothScroll()

  return (
    <main>
      {/* Hero — proves type, .display, .rise, ConnectiveLine, the one accent */}
      <Section style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', maxWidth: '60rem' }}>
          <ConnectiveLine mode="open" />
          <Eyebrow>Design System</Eyebrow>
          <h1 className="display rise" style={{ fontSize: 'var(--crtic-text-display)', marginBlock: '0.5rem 1.5rem' }}>
            CRTIC clean.
          </h1>
          <p
            className="rise"
            style={{ maxWidth: '46ch', fontSize: 'var(--crtic-text-body-lg)', color: 'var(--text-muted)', lineHeight: 'var(--crtic-leading-body)' }}
          >
            Blanco nieve, negro suave y un solo naranja. La esencia tecnocreativa, empaquetada para
            cualquier diseño.
          </p>
          <div className="rise" style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
            <Button href="#tokens">Ver tokens</Button>
            <Button href="#tokens" variant="ghost">
              Cómo usarlo
            </Button>
          </div>
        </div>
      </Section>

      {/* Palette */}
      <Section id="tokens">
        <Eyebrow>Paleta</Eyebrow>
        <h2 className="display" style={{ fontSize: 'var(--crtic-text-h2)', marginBlock: '0.75rem 2.5rem' }}>
          Seis colores. Un acento.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
          {SWATCHES.map((s) => (
            <Reveal as="div" key={s.name}>
              <div
                style={{
                  height: '96px',
                  borderRadius: 'var(--crtic-radius-md)',
                  backgroundColor: `var(${s.var})`,
                  boxShadow: s.ring ? 'inset 0 0 0 1px var(--border)' : 'none',
                }}
              />
              <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
                {s.name}
              </p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Components on a card surface */}
      <Section>
        <Eyebrow>Componentes</Eyebrow>
        <h2 className="display" style={{ fontSize: 'var(--crtic-text-h2)', marginBlock: '0.75rem 2.5rem' }}>
          Primitivas listas para usar.
        </h2>
        <div
          className="bg-card border-hairline"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--crtic-radius-lg)',
            padding: 'clamp(1.5rem, 4vw, 3rem)',
            boxShadow: 'var(--crtic-shadow-card)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <Button>Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <span className="eyebrow">Eyebrow label</span>
          <span style={{ color: 'var(--text-muted)' }}>Texto secundario en gris.</span>
        </div>
      </Section>

      {/* Inverse stage — proves the dark scrim tone */}
      <Section tone="inverse">
        <Eyebrow>Escenario</Eyebrow>
        <h2 className="display" style={{ fontSize: 'var(--crtic-text-h2)', marginTop: '0.75rem', maxWidth: '20ch' }}>
          El acento brilla sobre el escenario oscuro.
        </h2>
        <div style={{ marginTop: '2rem' }}>
          <Button href="#tokens">Acción</Button>
        </div>
      </Section>
    </main>
  )
}
