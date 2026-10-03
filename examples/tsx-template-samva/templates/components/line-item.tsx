/** @jsxImportSource @samva/markup/email */
import { fmt } from "@samva/markup/fmt";

/** A partial: a function from props to JSX in a project file. The compiler inlines it. */
export const LineItem = (props: {
  name: string;
  quantity: number;
  price: number;
  currency: string;
}) => (
  <p className="text-muted dark:text-muted-dark text-base">
    {props.quantity} × {props.name}: {fmt.money(props.price * props.quantity, props.currency)}
  </p>
);
