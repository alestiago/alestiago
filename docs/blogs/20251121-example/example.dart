void main() {
  print('Hello from Dart!');
  
  // Calculate factorial
  int n = 5;
  int result = factorial(n);
  print('Factorial of $n is $result');
  
  // Fibonacci sequence
  print('First 10 Fibonacci numbers:');
  for (int i = 0; i < 10; i++) {
    print('F($i) = ${fibonacci(i)}');
  }
}

int factorial(int n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

int fibonacci(int n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

