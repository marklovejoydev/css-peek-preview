export function App() {
  return (
    <main className="demo-page">
      <header className="demo-header">
        <p className="eyebrow">CSS PEEK PREVIEW</p>
        <h1 className="page-title">Try a few styles</h1>
        <p className="intro-copy">
          Place your cursor inside any class name and open the preview.
        </p>
      </header>

      <section className="preview-card">
        <div className="card-heading">
          <div>
            <span className="status-badge">Ready to preview</span>
            <h2 className="card-title">A small component gallery</h2>
          </div>
          <span className="avatar">CP</span>
        </div>

        <p className="card-copy">
          Try the buttons, badge, card, or text styles below. The preview panel
          refreshes when you edit this file's stylesheet.
        </p>

        <div className="button-row">
          <button className="component">Save changes</button>
          <button className="secondary-button">Cancel</button>
          <button className="danger-button">Delete</button>
        </div>

        <div className="tag-row">
          <span className="tag tag-blue">CSS</span>
          <span className="tag tag-green">Live update</span>
          <span className="tag tag-purple">TSX</span>
        </div>
      </section>

      <section className="info-grid">
        <article className="info-tile">
          <span className="tile-icon">01</span>
          <h3 className="tile-title">Find the class</h3>
          <p className="tile-copy">Put the caret inside a static className.</p>
        </article>
        <article className="info-tile">
          <span className="tile-icon">02</span>
          <h3 className="tile-title">See the style</h3>
          <p className="tile-copy">Inspect a visual sample and its CSS rules.</p>
        </article>
      </section>
    </main>
  );
}
