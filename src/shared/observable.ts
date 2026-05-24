export type Unsubscribe = () => void;
export type Observer<T> = (value: T) => void;

export interface Observable<T> {
  subscribe(observer: Observer<T>): Unsubscribe;
}

export class Subject<T> implements Observable<T> {
  private observers = new Set<Observer<T>>();

  subscribe(observer: Observer<T>): Unsubscribe {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  next(value: T): void {
    for (const o of this.observers) o(value);
  }

  complete(): void {
    this.observers.clear();
  }
}
