import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Toaster } from "@/components/ui/sonner";
import Login       from "@/pages/Login";
import Dashboard   from "@/pages/Dashboard";
import Users       from "@/pages/Users";
import Posts       from "@/pages/Posts";
import Merchants   from "@/pages/Merchants";
import PhoneShops  from "@/pages/PhoneShops";
import Transport   from "@/pages/Transport";
import MapPlaces   from "@/pages/MapPlaces";
import Communities from "@/pages/Communities";
import Ads         from "@/pages/Ads";
import Honored     from "@/pages/Honored";
import Missing        from "@/pages/Missing";
import Numbers        from "@/pages/Numbers";
import Events         from "@/pages/Events";
import Organizations  from "@/pages/Organizations";
import Education      from "@/pages/Education";
import WomenServices  from "@/pages/WomenServices";
import Reports        from "@/pages/Reports";
import PrayerSettings from "@/pages/PrayerSettings";
import Settings       from "@/pages/Settings";
import Jobs           from "@/pages/Jobs";
import Sports         from "@/pages/Sports";
import Notifications  from "@/pages/Notifications";
import MedicalClinics from "@/pages/MedicalClinics";
import Services       from "@/pages/Services";
import LawyersAdmin   from "@/pages/Lawyers";
import AppVersion    from "@/pages/AppVersion";
import ActivityLog   from "@/pages/ActivityLog";
import Telecom        from "@/pages/Telecom";
import TelecomPortal  from "@/pages/TelecomPortal";
import Unions         from "@/pages/Unions";
import Zawajil          from "@/pages/Zawajil";
import MerchantPortal  from "@/pages/MerchantPortal";
import GovEntities     from "@/pages/GovEntities";
import DesignGallery   from "@/pages/DesignGallery";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppRoutes() {
  const { user, loading, pinRequired } = useAuth();
  const [isPortal]    = useRoute("/telecom-portal");
  const [isMPortal]   = useRoute("/merchant-portal");
  if (isPortal)  return <TelecomPortal />;
  if (isMPortal) return <MerchantPortal />;

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "hsl(222 47% 8%)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🌿</div>
          <div style={{ color: "hsl(215 20% 55%)", fontSize: 15 }}>جارٍ التحميل...</div>
        </div>
      </div>
    );
  }

  if (!user || pinRequired) {
    return <Login />;
  }

  // مشرف الشركة المشغّلة: يصل فقط لشاشة "مشوارك علينا"
  if (user.role === "transport_supervisor") {
    return (
      <Layout>
        <Switch>
          <Route path="/transport" component={Transport} />
          <Route>
            <Transport />
          </Route>
        </Switch>
      </Layout>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/"            component={Dashboard} />
        <Route path="/users"       component={Users} />
        <Route path="/posts"       component={Posts} />
        <Route path="/merchants"   component={Merchants} />
        <Route path="/phone-shops" component={PhoneShops} />
        <Route path="/transport"   component={Transport} />
        <Route path="/map"         component={MapPlaces} />
        <Route path="/communities" component={Communities} />
        <Route path="/ads"         component={Ads} />
        <Route path="/honored"     component={Honored} />
        <Route path="/missing"       component={Missing} />
        <Route path="/numbers"       component={Numbers} />
        <Route path="/events"        component={Events} />
        <Route path="/organizations" component={Organizations} />
        <Route path="/education"     component={Education} />
        <Route path="/women"         component={WomenServices} />
        <Route path="/reports"        component={Reports} />
        <Route path="/prayer"         component={PrayerSettings} />
        <Route path="/jobs"           component={Jobs} />
        <Route path="/sports"         component={Sports} />
        <Route path="/notifications"  component={Notifications} />
        <Route path="/medical"        component={MedicalClinics} />
        <Route path="/services"       component={Services} />
        <Route path="/lawyers"        component={LawyersAdmin} />
        <Route path="/app-version"    component={AppVersion} />
        <Route path="/activity-log"   component={ActivityLog} />
        <Route path="/telecom"        component={Telecom} />
        <Route path="/unions"         component={Unions} />
        <Route path="/gov-entities"  component={GovEntities} />
        <Route path="/zawajil"        component={Zawajil} />
        <Route path="/design-gallery" component={DesignGallery} />
        <Route path="/settings"       component={Settings} />
        <Route>
          <div style={{ padding: 40, textAlign: "center", color: "hsl(215 20% 50%)" }}>
            الصفحة غير موجودة
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster richColors position="top-center" dir="rtl" />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
