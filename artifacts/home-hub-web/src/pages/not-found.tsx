import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-8xl font-serif font-bold text-primary/20 mb-6">404</div>
      <h1 className="text-3xl font-serif font-bold mb-4">Lost in the house?</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        We couldn't find the page you're looking for. It might have been moved, or maybe the dog ate it.
      </p>
      <Link 
        href="/"
        className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-10 px-4 py-2 gap-2"
      >
        <Home className="w-4 h-4" /> Back to Dashboard
      </Link>
    </div>
  );
}
