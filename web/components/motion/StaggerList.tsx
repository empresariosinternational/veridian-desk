"use client";

import { Children } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export default function StaggerList({ children, className }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {Children.map(children, (child) =>
        child ? (
          <motion.div key={(child as React.ReactElement).key} variants={staggerItem}>
            {child}
          </motion.div>
        ) : null
      )}
    </motion.div>
  );
}
