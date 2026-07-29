import { Outlet } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import NavigationDrawer from '../components/layout/NavigationDrawer';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import ToastContainer from '../components/common/ToastContainer';

export default function AppLayout() {
  return (
    <div className="app-container">
      <AppHeader />
      <NavigationDrawer />
      <div className="main-content">
        <Breadcrumbs />
        <div id="viewport" className="screen-viewport">
          <Outlet />
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
