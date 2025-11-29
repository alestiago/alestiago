void main() {
  const int iterations = 50 * 1000 * 1000;

  final swFunction = Stopwatch()..start();
  final f = compute(iterations);
  swFunction.stop();
  print("Function call: ${swFunction.elapsedMilliseconds} ms  (result: $f)");
}

@pragma('vm:never-inline')
int addFn(int a, int b) => a + b;

@pragma('vm:never-inline')
int consume(int x) => x.hashCode;

int compute(int iterations) {
  int f = 0;
  for (int i = 0; i < iterations; i++) {
    f = addFn(f, 1);
    consume(f); // prevents optimization
  }
  return f;
}
