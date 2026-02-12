import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:example/my_bloc.dart';
import 'package:example/user_repository.dart';
import 'package:test/test.dart';

class _MyBlocObserver extends BlocObserver {
  List<MyEvent> events = [];

  @override
  void onEvent(covariant MyBloc bloc, Object? event) {
    super.onEvent(bloc, event);
    if (event case MyEvent event) events.add(event);
  }
}

class _FakeUserRepository implements UserRepository {
  final _controller = StreamController<String>();

  @override
  Stream<String> get user => _controller.stream;

  void addUser(String user) => _controller.add(user);

  void dispose() => _controller.close();
}

void main() {
  late _FakeUserRepository userRepository;
  late _MyBlocObserver observer;

  setUp(() {
    final previousObserver = Bloc.observer;
    addTearDown(() => Bloc.observer = previousObserver);
    observer = _MyBlocObserver();
    Bloc.observer = observer;

    userRepository = _FakeUserRepository();
    addTearDown(() => userRepository.dispose());
  });

  blocTest<MyBloc, MyState>(
    'adds EventB when user changes',
    build: () => MyBloc(userRepository: userRepository),
    act: (_) => userRepository.addUser('user'),
    verify: (_) => expect(observer.events, containsOnce(isA<EventB>())),
  );

  blocTest<MyBloc, MyState>(
    'EventA adds EventB',
    build: () => MyBloc(userRepository: userRepository),
    act: (bloc) => bloc.add(EventA()),
    verify: (_) => expect(observer.events, containsOnce(isA<EventB>())),
  );
}
