import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, ShieldOff, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { createAuditLogEntry } from '@/hooks/use-audit-log';

interface UserWithRole {
  id: string;
  display_name: string;
  created_at: string;
  isAdmin: boolean;
}

async function fetchUsersWithRoles(): Promise<UserWithRole[]> {
  // Fetch all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, created_at')
    .order('created_at', { ascending: true });

  if (profilesError) throw profilesError;

  // Fetch all admin roles
  const { data: adminRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');

  if (rolesError) throw rolesError;

  const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

  return (profiles || []).map(profile => ({
    id: profile.id,
    display_name: profile.display_name,
    created_at: profile.created_at,
    isAdmin: adminUserIds.has(profile.id),
  }));
}

export function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser, profile } = useAuthContext();
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: fetchUsersWithRoles,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      setActionUserId(userId);

      if (makeAdmin) {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin' });
        if (error) throw error;
      } else {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        if (error) throw error;
      }

      // Create audit log entry
      const targetUser = users?.find(u => u.id === userId);
      await createAuditLogEntry({
        action: makeAdmin ? 'user.role.promote' : 'user.role.demote',
        entityType: 'user',
        entityId: userId,
        actorId: currentUser?.id,
        actorName: profile?.display_name || currentUser?.email || 'Unknown',
        details: {
          targetUser: targetUser?.display_name,
          role: 'admin',
          action: makeAdmin ? 'granted' : 'revoked',
        },
      });
    },
    onSuccess: (_, { makeAdmin }) => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({
        title: makeAdmin ? 'Admin role granted' : 'Admin role revoked',
        description: `User role has been updated successfully.`,
      });
    },
    onError: (error) => {
      console.error('Failed to update role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user role. Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setActionUserId(null);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load users. Please try again later.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Management
        </CardTitle>
        <CardDescription>
          View and manage user roles. New users are assigned the basic "user" role by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user) => {
              const isCurrentUser = user.id === currentUser?.id;
              const isActioning = actionUserId === user.id;

              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.display_name}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.isAdmin ? (
                      <Badge variant="default" className="gap-1">
                        <Shield className="h-3 w-3" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">User</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isCurrentUser && (
                      <Button
                        variant={user.isAdmin ? 'outline' : 'default'}
                        size="sm"
                        className="gap-1"
                        disabled={isActioning || toggleAdminMutation.isPending}
                        onClick={() => toggleAdminMutation.mutate({
                          userId: user.id,
                          makeAdmin: !user.isAdmin,
                        })}
                      >
                        {isActioning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : user.isAdmin ? (
                          <>
                            <ShieldOff className="h-3 w-3" />
                            Remove Admin
                          </>
                        ) : (
                          <>
                            <Shield className="h-3 w-3" />
                            Make Admin
                          </>
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {(!users || users.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
