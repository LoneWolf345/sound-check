import { Link } from 'react-router-dom';
import { AudioWaveform, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * SSO Callback Page (Stub)
 * 
 * This page is a placeholder for future SAML/OAuth SSO integration.
 * When SSO is implemented, this page will:
 * 1. Receive the callback from the identity provider
 * 2. Exchange the authorization code for tokens
 * 3. Create or link the user account
 * 4. Redirect to the main application
 */
export default function SSOCallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <AudioWaveform className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">SSO Authentication</CardTitle>
          <CardDescription>Single Sign-On integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Coming Soon</p>
              <p className="text-sm text-muted-foreground">
                SSO integration is not yet configured for this application.
                Please contact your administrator for more information.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild variant="ghost" className="gap-2">
            <Link to="/login">
              <ArrowLeft className="h-4 w-4" />
              Return to Login
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
