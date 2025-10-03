import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Library,
  Settings,
  ChevronDown,
  Plus,
  Folder,
  Upload,
  MessageSquare,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Folder as FolderType } from "@/types/library";

export function AppSidebar() {
  const { state } = useSidebar();
  const [location] = useLocation();
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameFolderDescription, setRenameFolderDescription] = useState("");
  const collapsed = state === "collapsed";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isActive = (path: string) =>
    location === path || (location?.startsWith(path) && location.charAt(path.length) === "/");

  const mainNavItems = [
    { path: "/upload", label: "Upload AFIs", icon: Upload },
    { path: "/master-library", label: "Master Library", icon: Library },
    { path: "/chat", label: "AI Assistant", icon: MessageSquare },
    { path: "/configure", label: "Configure Output", icon: Settings },
  ];

  // Fetch folders from API
  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: ["/api/folders"],
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (folderData: { name: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/folders", folderData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({
        title: "Folder created",
        description: `Organization folder "${newFolderName}" has been created successfully.`,
      });
      setShowNewFolderDialog(false);
      setNewFolderName("");
      setNewFolderDescription("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create folder. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Rename folder mutation
  const renameFolderMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; description?: string }) => {
      const response = await apiRequest("PATCH", `/api/folders/${payload.id}`, {
        name: payload.name,
        description: payload.description,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({ title: "Folder updated", description: `Folder renamed to "${renameFolderName}".` });
      setRenameFolderId(null);
      setRenameFolderName("");
      setRenameFolderDescription("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update folder.", variant: "destructive" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({ title: "Folder deleted", description: "The folder was removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete folder.", variant: "destructive" });
    },
  });

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a folder name.",
        variant: "destructive",
      });
      return;
    }

    createFolderMutation.mutate({
      name: newFolderName.trim(),
      description: newFolderDescription.trim() || undefined,
    });
  };

  return (
    <Sidebar 
      collapsible="icon" 
      className="border-r border-gray-700 bg-gray-800 transition-all duration-300 ease-in-out"
    >
      <SidebarHeader className="bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2 px-4 py-3">
          <Building2 className="h-6 w-6 text-blue-400 flex-shrink-0" />
          {!collapsed && (
            <div className="flex flex-col transition-opacity duration-200">
              <span className="font-semibold text-gray-100">AFI Search</span>
              <span className="text-xs text-gray-400">Sigonella Spark Cell</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-gray-800">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-gray-400 text-xs font-medium uppercase tracking-wider">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.path)}
                    className={isActive(item.path) 
                      ? "bg-gray-700 text-white hover:bg-gray-600" 
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"}
                  >
                    <Link href={item.path}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Organization Folders */}
        {!collapsed && (
          <SidebarGroup>
            <Collapsible open={foldersOpen} onOpenChange={setFoldersOpen}>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full flex items-center justify-between text-gray-400 hover:text-gray-200 text-xs font-medium uppercase tracking-wider">
                  <span>Organization Folders</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      foldersOpen ? "rotate-180" : ""
                    }`}
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        className="text-gray-300 hover:bg-gray-700 hover:text-white"
                        onClick={() => setShowNewFolderDialog(true)}
                      >
                        <Plus className="h-4 w-4" />
                        <span>New Folder</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {folders.length === 0 ? (
                      <SidebarMenuItem>
                        <div className="px-2 py-2 text-xs text-gray-500 italic">
                          No folders yet. Create one to get started.
                        </div>
                      </SidebarMenuItem>
                    ) : (
                      folders.map((folder) => (
                        <SidebarMenuItem key={folder.id}>
                          <div className="flex items-center">
                            <SidebarMenuButton
                              asChild
                              isActive={isActive(`/folders/${folder.id}`)}
                              className={isActive(`/folders/${folder.id}`)
                                ? "flex-1 bg-gray-700 text-white hover:bg-gray-600"
                                : "flex-1 text-gray-300 hover:bg-gray-700 hover:text-white"}
                            >
                              <Link href={`/folders/${folder.id}`}>
                                <Folder className="h-4 w-4" />
                                <span className="flex-1 truncate">{folder.name}</span>
                              </Link>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[180px]">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRenameFolderId(folder.id);
                                    setRenameFolderName(folder.name);
                                    setRenameFolderDescription(folder.description ?? "");
                                  }}
                                >
                                  <Pencil className="h-4 w-4 mr-2" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-500 focus:text-red-500"
                                  onClick={() => {
                                    const ok = window.confirm(`Delete folder "${folder.name}"? This will permanently delete all documents in this folder.`);
                                    if (!ok) return;
                                    deleteFolderMutation.mutate(folder.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </SidebarMenuItem>
                      ))
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="bg-gray-900 border-t border-gray-700">
        {!collapsed && (
          <div className="px-4 py-2 text-xs text-gray-500">
            SSgt Kevin Crandell
          </div>
        )}
      </SidebarFooter>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization Folder</DialogTitle>
            <DialogDescription>
              Organization folders help you group and scope AFI documents for specific units or purposes.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name *</Label>
              <Input
                id="folder-name"
                placeholder="e.g., 319th Reconnaissance Wing"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateFolder();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-description">Description (Optional)</Label>
              <Input
                id="folder-description"
                placeholder="Brief description of this organizational scope"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowNewFolderDialog(false);
                setNewFolderName("");
                setNewFolderDescription("");
              }}
              disabled={createFolderMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateFolder}
              disabled={createFolderMutation.isPending}
            >
              {createFolderMutation.isPending ? (
                <>Creating...</>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Folder
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renameFolderId} onOpenChange={(open) => { if (!open) { setRenameFolderId(null); setRenameFolderName(""); setRenameFolderDescription(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>Update the folder name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-folder-name">Folder Name *</Label>
              <Input id="rename-folder-name" value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rename-folder-description">Description</Label>
              <Input id="rename-folder-description" value={renameFolderDescription} onChange={(e) => setRenameFolderDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameFolderId(null); setRenameFolderName(""); setRenameFolderDescription(""); }}>Cancel</Button>
            <Button onClick={() => {
              if (!renameFolderId || !renameFolderName.trim()) { toast({ title: "Name required", description: "Please enter a folder name.", variant: "destructive" }); return; }
              renameFolderMutation.mutate({ id: renameFolderId, name: renameFolderName.trim(), description: renameFolderDescription.trim() || undefined });
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
