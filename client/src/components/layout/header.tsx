import { Link, useLocation } from "wouter";
import { Bell, UserCircle } from "lucide-react";

export default function Header() {
  const [location] = useLocation();

  const navItems = [
    { href: "/upload", label: "Document Upload", id: "upload" },
    { href: "/library", label: "Document Library", id: "library" },
    { href: "/chat", label: "AI Assistant", id: "chat" },
    { href: "/settings", label: "Settings", id: "settings" },
  ];

  const isActive = (href: string) => {
    return location === href || (href === "/upload" && location === "/");
  };

  return (
    <header className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-primary">AFI Management System</h1>
            </div>
            <nav className="hidden md:block">
              <ul className="flex space-x-8">
                {navItems.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`${
                        isActive(item.href)
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:text-primary"
                      }`}
                      data-testid={`nav-${item.id}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              className="text-muted-foreground hover:text-foreground"
              data-testid="notifications-button"
            >
              <Bell className="h-5 w-5" />
            </button>
            <button 
              className="text-muted-foreground hover:text-foreground"
              data-testid="profile-button"
            >
              <UserCircle className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
