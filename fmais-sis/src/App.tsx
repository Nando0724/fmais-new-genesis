import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { canAccess, useStore, type Area } from "./lib/store";
import Attendance from "./pages/Attendance";
import Billing from "./pages/Billing";
import Crm from "./pages/Crm";
import Dashboard from "./pages/Dashboard";
import Enrollments from "./pages/Enrollments";
import LeadForm from "./pages/LeadForm";
import Marketing from "./pages/Marketing";
import Login from "./pages/Login";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import StudentProfile from "./pages/StudentProfile";
import Students from "./pages/Students";

function Guard({ area, children }: { area: Area; children: JSX.Element }) {
  const { user } = useStore();
  if (!canAccess(user?.role, area)) return <Navigate to={canAccess(user?.role, "dashboard") ? "/" : "/students"} replace />;
  return children;
}

export default function App() {
  const { user } = useStore();
  return (
    <Routes>
      {/* Formulario público de captura de leads (fuente "Formulario web") */}
      <Route path="/form" element={<LeadForm />} />
      {!user ? (
        <Route path="*" element={<Login />} />
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Guard area="dashboard"><Dashboard /></Guard>} />
          <Route path="crm" element={<Guard area="crm"><Crm /></Guard>} />
          <Route path="marketing" element={<Guard area="marketing"><Marketing /></Guard>} />
          <Route path="enrollments"element={<Guard area="enrollments"><Enrollments /></Guard>} />
          <Route path="students" element={<Guard area="students"><Students /></Guard>} />
          <Route path="students/:id" element={<Guard area="students"><StudentProfile /></Guard>} />
          <Route path="billing" element={<Guard area="billing"><Billing /></Guard>} />
          <Route path="attendance" element={<Guard area="attendance"><Attendance /></Guard>} />
          <Route path="reports" element={<Guard area="reports"><Reports /></Guard>} />
          <Route path="settings" element={<Guard area="settings"><SettingsPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}
