import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Home,
  Plus,
  List,
  Settings,
  FileText,
  User,
  ChevronDown,
  Menu,
  X,
  AudioWaveform,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/contexts/AuthContext';
import { useState } from 'react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/jobs/new', label: 'New Job', icon: Plus },
  { to: '/jobs', label: 'Jobs', icon: List },
];

const adminItems = [
  { to: '/admin', label: 'Admin Settings', icon: Settings },
  { to: '/audit', label: 'Audit Log', icon: FileText },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { internalUser, internalUsers, switchUser, isAdmin, isLoading, isSwitching } = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {/* Logo */}
          <RouterNavLink to="/" className="mr-6 flex items-center space-x-2">
            <AudioWaveform className="h-6 w-6 text-primary" />
            <span className="hidden font-semibold sm:inline-block">
              Sound Check
            </span>
          </RouterNavLink>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 flex-1">
            {navItems.map((item) => (
              <RouterNavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </RouterNavLink>
            ))}
            {isAdmin &&
              adminItems.map((item) => (
                <RouterNavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </RouterNavLink>
              ))}
          </nav>

          {/* User Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2" disabled={isSwitching}>
                {isSwitching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {isLoading ? 'Loading...' : internalUser?.name ?? 'Sign In'}
                </span>
                {isAdmin && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                )}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover">
              {internalUsers.map((u) => (
                <DropdownMenuItem
                  key={u.email}
                  onClick={() => switchUser(u.email)}
                  disabled={isSwitching}
                  className={cn(
                    'flex items-center justify-between',
                    u.email === internalUser?.email && 'bg-accent'
                  )}
                >
                  <span>{u.name}</span>
                  {u.isAdmin && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t bg-background p-4 space-y-1">
            {navItems.map((item) => (
              <RouterNavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </RouterNavLink>
            ))}
            {isAdmin &&
              adminItems.map((item) => (
                <RouterNavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </RouterNavLink>
              ))}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container py-6">{children}</main>
    </div>
  );
}
