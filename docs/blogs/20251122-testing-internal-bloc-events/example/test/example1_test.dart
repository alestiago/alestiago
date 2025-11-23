import 'package:bloc/bloc.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:example/foo_bloc.dart';
import 'package:test/test.dart';

class _FooBlocObserver extends BlocObserver {
  List<FooEvent> events = [];

  @override
  void onEvent(covariant FooBloc bloc, Object? event) {
    super.onEvent(bloc, event);
    if (event case FooEvent event) events.add(event);
  }
}

void main() {
  blocTest<FooBloc, FooState>(
    'EventA adds EventC',
    build: () => FooBloc(),
    setUp: () => Bloc.observer = _FooBlocObserver(),
    act: (bloc) => bloc.add(EventA()),
    verify: (bloc) {
      final observer = Bloc.observer as _FooBlocObserver;
      expect(observer.events, containsOnce(isA<EventC>())); // Pass
    },
  );
}
