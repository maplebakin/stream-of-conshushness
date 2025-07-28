export default function Layout({ children, sectionName }) {
  return (
    <>
      <Header />
      <div className="main-container">
        <Sidebar sectionName={sectionName} />
        <main className="main-feed">{children}</main>
      </div>
    </>
  );
}
