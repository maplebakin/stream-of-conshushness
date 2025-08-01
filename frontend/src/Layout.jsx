import Header from "./Header";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <>
      <Header />
      <div className="main-container">
        <Sidebar />
        <main className="main-feed">
          <Outlet />
        </main>
      </div>
    </>
  );
}
