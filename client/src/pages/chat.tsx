import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, MessageCircle, Send, Mic, Plus } from "lucide-react";
import Message from "@/components/chat/message";
import { apiRequest } from "@/lib/queryClient";
import { type Folder, type ChatSession, type ChatMessage, type Document } from "@shared/schema";

export default function Chat() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [scopeFolder, setScopeFolder] = useState("all");
  const [scopeAfi, setScopeAfi] = useState("all");
  const [messageInput, setMessageInput] = useState("");
  const [currentSession, setCurrentSession] = useState<string | null>(null);

  // Fetch folders
  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ["/api/folders"],
  });

  // Fetch documents to get unique AFI numbers
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  // Fetch chat sessions
  const { data: sessions = [] } = useQuery<ChatSession[]>({
    queryKey: ["/api/chat/sessions"],
  });

  // Fetch messages for current session
  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/sessions", currentSession, "messages"],
    enabled: !!currentSession,
  });

  // Create new chat session
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/chat/sessions", {
        scopeFolder: scopeFolder === "all" ? null : scopeFolder,
        scopeAfi: scopeAfi === "all" ? null : scopeAfi,
        title: "New Chat Session",
      });
      return response.json();
    },
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setCurrentSession(newSession.id);
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ sessionId, content }: { sessionId: string; content: string }) => {
      // Send user message - backend automatically generates ChromaDB-powered AI response
      const response = await apiRequest("POST", `/api/chat/sessions/${sessionId}/messages`, {
        role: "user",
        content,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", currentSession, "messages"] });
      setMessageInput("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;

    if (!currentSession) {
      // Create new session first
      createSessionMutation.mutate();
      return;
    }

    sendMessageMutation.mutate({
      sessionId: currentSession,
      content: messageInput.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Get unique AFI numbers from actual documents
  const afiNumbers = Array.from(new Set(documents.map(doc => doc.afiNumber).filter(Boolean))).sort();

  return (
    <div className="space-y-6">
      {/* Search Scope Configuration */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Scope
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Search Scope</Label>
              <Select value={scopeFolder} onValueChange={setScopeFolder}>
                <SelectTrigger data-testid="scope-folder-select">
                  <SelectValue placeholder="All Folders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Folders</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Specific AFI (Optional)</Label>
              <Select value={scopeAfi} onValueChange={setScopeAfi}>
                <SelectTrigger data-testid="scope-afi-select">
                  <SelectValue placeholder="All AFIs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AFIs</SelectItem>
                  {afiNumbers.map((afi) => (
                    <SelectItem key={afi} value={afi}>
                      {afi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Current scope:</strong> {scopeFolder === "all" ? "All Folders" : folders.find(f => f.id === scopeFolder)?.name}
              {scopeAfi !== "all" && ` - ${scopeAfi}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chat Interface */}
      <Card className="border-border bg-card h-[600px] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-foreground flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Chat with AFI Assistant
          </CardTitle>
        </CardHeader>

        {/* Messages Area */}
        <CardContent className="flex-1 overflow-y-auto p-4">
          {!currentSession ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Start a conversation by asking a question about AFI procedures.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="space-y-2 max-w-[80%]">
                    <div className="p-3 rounded-lg bg-muted">
                      <p className="text-sm">
                        Welcome to the AFI Chat Assistant. I can help you find information from Air Force Instructions. 
                        Please ask me any questions about procedures, requirements, or guidance.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}

              {sendMessageMutation.isPending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="flex gap-1 animate-bounce-dots">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Input Area */}
        <CardContent className="border-t border-border p-4 flex-shrink-0">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Ask about AFI procedures, requirements, or guidance..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pr-16"
                data-testid="message-input"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                {messageInput.length}/500
              </div>
            </div>
            <Button 
              variant="outline" 
              size="icon"
              data-testid="voice-input-button"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button 
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || sendMessageMutation.isPending}
              data-testid="send-message-button"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
          
          {/* New Session Button */}
          <div className="mt-3 pt-3 border-t border-border">
            <Button 
              variant="outline" 
              onClick={() => {
                setCurrentSession(null);
                createSessionMutation.mutate();
              }}
              disabled={createSessionMutation.isPending}
              className="w-full"
              data-testid="new-session-button"
            >
              <Plus className="h-4 w-4 mr-2" />
              {createSessionMutation.isPending ? "Starting New Session..." : "Start New Session"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
