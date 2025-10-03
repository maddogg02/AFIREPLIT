import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Upload from "@/pages/upload";
import Library from "@/pages/library";
import MasterLibraryNew from "@/pages/master-library-new";
import Chat from "@/pages/chat";
import Settings from "@/pages/settings";
import FolderLibrary from "@/pages/folder-library";
import Configure from "@/pages/configure";

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <Switch>
        <Route path="/" component={Upload} />
        <Route path="/upload" component={Upload} />
        <Route path="/library" component={Library} />
        <Route path="/master-library" component={MasterLibraryNew} />
  <Route path="/folders/:folderId" component={FolderLibrary} />
  <Route path="/chat" component={Chat} />
  <Route path="/configure" component={Configure} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
