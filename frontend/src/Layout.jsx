import Header from "./Header";
import Sidebar from "./Sidebar";
import { Outlet, useLocation } from "react-router-dom";

export default function Layout() {
  const location = useLocation();
  const isCalendar = location.pathname.startsWith("/calendar");

  return (
    <div className="app-layout">
      <Header />
      <div className={`main-container ${isCalendar ? 'calendar-layout-full' : ''}`}>
        {isCalendar ? (
          <>
            <Outlet />
            <Sidebar />
          </>
        ) : (
          <>
            <Sidebar />
            <main className="main-feed">
              <Outlet />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
